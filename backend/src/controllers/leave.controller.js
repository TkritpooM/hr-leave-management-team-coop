// backend/src/controllers/leave.controller.js

const prisma = require('../models/prisma');
const fs = require('fs');
const path = require('path');
const leaveService = require('../services/leave.service');
const leaveModel = require('../models/leave.model');
const notificationService = require('../services/notification.service');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');

const requestLeave = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.user.employeeId);
        const { startDate, endDate, leaveTypeId, startDuration, endDuration, reason } = req.body;

        const attachmentUrl = req.file ? req.file.filename : null;

        // 1. ตรวจสอบการลาทับซ้อน
        await leaveService.checkLeaveOverlap(employeeId, startDate, endDate);

        // 2. คำนวณจำนวนวันที่ลา (หักวันหยุด)
        const totalDaysRequested = await leaveService.calculateTotalDays(startDate, endDate, startDuration, endDuration);
        
        if (totalDaysRequested <= 0) {
            return res.status(200).json({ success: false, message: "จำนวนวันลาต้องมากกว่า 0" });
        }

        const requestYear = moment(startDate).year(); 
        await leaveService.checkQuotaAvailability(employeeId, parseInt(leaveTypeId), totalDaysRequested, requestYear);

        // 3. บันทึกข้อมูลใบลา (Database Transaction)
        const result = await prisma.$transaction(async (tx) => {
            // บันทึกคำขอลา
            const newRequest = await tx.leaveRequest.create({
                data: {
                    employeeId,
                    leaveTypeId: parseInt(leaveTypeId),
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    totalDaysRequested,
                    startDuration: startDuration || 'Full',
                    endDuration: endDuration || 'Full',
                    reason: reason || null,
                    attachmentUrl: attachmentUrl,
                    status: 'Pending',
                },
                include: {
                    employee: { select: { firstName: true, lastName: true } },
                    leaveType: { select: { typeName: true } }
                }
            });

            // 4. ค้นหา HR ทุกคนเพื่อส่งแจ้งเตือน
            const allHR = await tx.employee.findMany({
                where: { role: 'HR', isActive: true },
                select: { employeeId: true }
            });

            // 5. สร้างการแจ้งเตือนลง Database ให้ HR ทุกคน (Persistent)
            const notificationData = allHR.map(hr => ({
                employeeId: hr.employeeId,
                notificationType: 'NewRequest',
                // ✅ แก้ไขตรงนี้: เช็คเงื่อนไขให้ถูกต้อง
                message: `มีคำขอลาใหม่จากคุณ ${newRequest.employee ? `${newRequest.employee.firstName} ${newRequest.employee.lastName}` : 'พนักงาน'} (${newRequest.leaveType.typeName})`,
                relatedRequestId: newRequest.requestId,
                isRead: false
            }));

            if (notificationData.length > 0) {
                await tx.notification.createMany({
                    data: notificationData
                });
            }

            return { newRequest, allHR };
        });

        // 6. ส่ง Real-time WebSocket ให้ HR ทุกคนที่ออนไลน์
        result.allHR.forEach(hr => {
            notificationService.sendNotification(hr.employeeId, {
                type: 'NOTIFICATION',
                data: {
                    type: 'NewRequest',
                    message: `มีคำขอลาใหม่เข้ามา (ID: ${result.newRequest.requestId})`,
                    requestId: result.newRequest.requestId
                }
            });
        });

        res.status(201).json({ success: true, message: 'ส่งคำขอลาสำเร็จและแจ้งเตือน HR แล้ว', request: result.newRequest });
    } catch (error) {
        if (error.statusCode === 409 || error.statusCode === 400) {
            return res.status(200).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getMyRequests = async (req, res, next) => {
    try {
        // 1. ตรวจสอบว่า req.user ถูกส่งมาจาก Middleware จริงไหม
        if (!req.user || !req.user.employeeId) {
            return res.status(401).json({ success: false, message: "Unauthorized: No employee ID found in token" });
        }

        const employeeId = parseInt(req.user.employeeId);

        // 2. ดึงข้อมูลจากฐานข้อมูล
        const requests = await prisma.leaveRequest.findMany({
            where: { 
                employeeId: employeeId 
            },
            include: { 
                leaveType: true // ดึงชื่อประเภทการลามาด้วย
            },
            orderBy: { 
                requestedAt: 'desc' 
            }
        });

        // 3. ส่ง Response กลับ
        res.status(200).json({ 
            success: true, 
            requests: requests 
        });

    } catch (error) {
        // 🔥 สำคัญมาก: พิมพ์ Error ออกมาดูที่หน้าจอ Terminal ของ Backend
        console.error("DEBUG - getMyRequests Error Detailed:", error);
        next(error); 
    }
};

const cancelLeaveRequest = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.user.employeeId);
        const requestId = parseInt(req.params.requestId);

        // 1. ค้นหาใบลาและตรวจสอบว่าเป็นเจ้าของจริงไหม (ดึง attachmentUrl มาด้วย)
        const leaveRequest = await prisma.leaveRequest.findUnique({
            where: { requestId },
            select: {
                employeeId: true,
                status: true,
                attachmentUrl: true // 🔥 ดึงชื่อไฟล์มาเพื่อเตรียมลบ
            }
        });

        if (!leaveRequest) {
            throw CustomError.notFound('ไม่พบคำขอลาที่ระบุ');
        }

        if (leaveRequest.employeeId !== employeeId) {
            throw CustomError.forbidden('คุณไม่มีสิทธิ์ยกเลิกคำขอลาของผู้อื่น');
        }

        // 2. ตรวจสอบสถานะ (ต้องเป็น Pending เท่านั้นถึงจะยกเลิกได้)
        if (leaveRequest.status !== 'Pending') {
            return res.status(200).json({ 
                success: false, 
                message: `ไม่สามารถยกเลิกได้ เนื่องจากรายการนี้ถูก ${leaveRequest.status === 'Approved' ? 'อนุมัติ' : 'ปฏิเสธ'} ไปแล้ว` 
            });
        }

        // --- 🔥 ส่วนที่เพิ่มเข้ามา: ลบไฟล์รูปจริงออกจากโฟลเดอร์ uploads ---
        if (leaveRequest.attachmentUrl) {
            const filePath = path.join(__dirname, '../../uploads', leaveRequest.attachmentUrl);
            
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (err) console.error("Failed to delete file during cancellation:", err);
                    else console.log("Deleted file due to cancellation:", leaveRequest.attachmentUrl);
                });
            }
        }

        // 3. ใช้ Transaction อัปเดตสถานะ และลบ Notification "NewRequest" ของ HR ออกจาก DB
        await prisma.$transaction(async (tx) => {
            // อัปเดตสถานะเป็น Cancelled
            await tx.leaveRequest.update({
                where: { requestId },
                data: { 
                    status: 'Cancelled',
                    attachmentUrl: null // 🔥 ล้างชื่อไฟล์ใน DB ออกด้วยหลังจากไฟล์จริงถูกลบ
                }
            });

            // ลบแจ้งเตือน "คำขอใหม่" เดิมออกจาก Database ของ HR ทุกคน
            await tx.notification.deleteMany({
                where: {
                    relatedRequestId: requestId,
                    notificationType: 'NewRequest'
                }
            });
        });

        // 4. ส่งสัญญาณ WebSocket แบบพิเศษ เพื่อให้หน้าจอ HR อัปเดตข้อมูล
        const allHR = await prisma.employee.findMany({
            where: { role: 'HR', isActive: true },
            select: { employeeId: true }
        });

        allHR.forEach(hr => {
            notificationService.sendNotification(hr.employeeId, {
                type: 'UPDATE_SIGNAL', 
                action: 'REFRESH_LEAVE_LIST',
                requestId: requestId
            });
        });

        res.status(200).json({ success: true, message: 'ยกเลิกคำขอลาและลบไฟล์แนบเรียบร้อยแล้ว' });

    } catch (error) {
        next(error);
    }
};

const getAllPendingRequests = async (req, res, next) => {
    try {
        const pendingRequests = await prisma.leaveRequest.findMany({
            where: { status: 'Pending' },
            include: { employee: { select: { employeeId: true, firstName: true, lastName: true } }, leaveType: true },
            orderBy: { requestedAt: 'asc' },
        });
        res.status(200).json({ success: true, requests: pendingRequests });
    } catch (error) { next(error); }
};

const getRequestDetail = async (req, res, next) => {
    try {
        const requestId = parseInt(req.params.requestId);
        const request = await leaveModel.getLeaveRequestById(requestId);

        if (!request) { throw CustomError.notFound('Leave request not found.'); }
        if (req.user.role !== 'HR' && req.user.employeeId !== request.employeeId) {
            throw CustomError.forbidden('You are not authorized to view this request.');
        }

        res.status(200).json({ success: true, request });
    } catch (error) { next(error); }
};

const handleApproval = async (req, res, next) => {
    try {
        const hrId = req.user.employeeId;
        const requestId = parseInt(req.params.requestId);
        const { action } = req.body; 

        const originalRequest = await leaveModel.getLeaveRequestById(requestId);
        if (!originalRequest || originalRequest.status !== 'Pending') {
            throw CustomError.badRequest('ไม่พบคำขอลา หรือคำขอนี้ถูกดำเนินการไปแล้ว');
        }

        const result = await prisma.$transaction(async (tx) => {
            const requestedDays = originalRequest.totalDaysRequested.toNumber();
            const requestYear = moment(originalRequest.startDate).year();
            const leaveTypeId = originalRequest.leaveTypeId;
            const employeeId = originalRequest.employeeId;

            let finalStatus = 'Rejected';
            
            if (action === 'approve') {
                const leaveType = await tx.leaveType.findUnique({ where: { leaveTypeId } });

                if (leaveType?.isPaid) {
                    const quota = await tx.leaveQuota.findUnique({
                        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: requestYear } },
                    });
                    
                    if (!quota) {
                        throw CustomError.badRequest("ไม่พบข้อมูลโควต้าสำหรับการลาประเภทนี้ในปีปัจจุบัน");
                    }

                    // 🔥 ตรรกะใหม่: ตรวจสอบจากสิทธิ์รวม (ปีปัจจุบัน + ยอดทบ)
                    const totalEffectiveQuota = quota.totalDays.toNumber() + quota.carriedOverDays.toNumber();
                    const availableDays = parseFloat((totalEffectiveQuota - quota.usedDays.toNumber()).toFixed(2));
                    
                    if (requestedDays > availableDays) {
                        throw CustomError.conflict(`โควต้าไม่พออนุมัติ (คงเหลือรวมยอดทบ: ${availableDays}, ต้องการใช้: ${requestedDays})`);
                    }

                    // อัปเดตยอดใช้ไป
                    await tx.leaveQuota.update({
                        where: { quotaId: quota.quotaId },
                        data: { usedDays: { increment: requestedDays } }
                    });
                }
                finalStatus = 'Approved';
            } 
            
            // อัปเดตสถานะใบลา
            const updatedRequest = await tx.leaveRequest.update({
                where: { requestId },
                data: {
                    status: finalStatus,
                    approvedByHrId: hrId,
                    approvalDate: new Date(),
                }
            });

            // สร้าง Notification
            const newNotification = await tx.notification.create({
                data: {
                    employeeId: employeeId,
                    notificationType: finalStatus === 'Approved' ? 'Approval' : 'Rejection',
                    message: `คำขอลาของคุณ (ID: ${requestId}) ได้ถูก ${finalStatus === 'Approved' ? 'อนุมัติ' : 'ปฏิเสธ'} แล้ว`,
                    relatedRequestId: requestId,
                    isRead: false
                }
            });

            return { updatedRequest, newNotification };
        });

        // ส่ง WebSocket
        notificationService.sendNotification(result.updatedRequest.employeeId, {
            type: 'NOTIFICATION',
            data: result.newNotification
        });

        res.status(200).json({ 
            success: true, 
            message: `ดำเนินการ ${result.updatedRequest.status.toLowerCase()} สำเร็จ`, 
            request: result.updatedRequest 
        });

    } catch (error) { 
        if (error.statusCode === 409 || error.statusCode === 400) {
            return res.status(200).json({ success: false, message: error.message });
        }
        next(error); 
    }
};

// ปรับปรุงฟังก์ชัน getMyQuotas ให้ส่งค่า availableDays ที่รวมยอดทบแล้ว
const getMyQuotas = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.user.employeeId);
        const currentYear = moment().year();

        const quotas = await prisma.leaveQuota.findMany({
            where: { employeeId, year: currentYear },
            include: { leaveType: true }
        });
        
        const formattedQuotas = quotas.map(q => {
            const total = parseFloat(q.totalDays.toString());
            const carried = parseFloat(q.carriedOverDays.toString());
            const used = parseFloat(q.usedDays.toString());
            
            return {
                ...q,
                totalDays: total,
                carriedOverDays: carried,
                usedDays: used,
                // 🔥 สิทธิ์คงเหลือ = (ปีปัจจุบัน + ยอดทบ) - ใช้ไป
                availableDays: parseFloat((total + carried - used).toFixed(2)),
            };
        });

        res.status(200).json({ success: true, quotas: formattedQuotas });
    } catch (error) { 
        next(error); 
    }
};

const getAllLeaveRequests = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        const requests = await prisma.leaveRequest.findMany({
            where: {
                // Filter ตามช่วงวันที่ถ้าร้องขอ (ใช้สำหรับ Calendar View)
                ...(startDate && { startDate: { gte: new Date(startDate) } }),
                ...(endDate && { endDate: { lte: new Date(endDate) } }),
            },
            include: { 
                employee: { select: { employeeId: true, firstName: true, lastName: true } }, 
                leaveType: true 
            },
            orderBy: { requestedAt: 'desc' },
        });

        res.status(200).json({ success: true, requests });
    } catch (error) { next(error); }
};

// ตัวอย่าง handlers ที่ route ต้องการ (stub/ตัวอย่าง)
const getAllRequests = async (req, res, next) => {
  try {
    // ถ้ามี model ให้เรียกใช้งานจริง เช่น:
    // const list = await leaveModel.getAll();
    // return res.status(200).json({ success: true, data: list });

    // ถ้าไม่ได้เชื่อม model ยังใช้งานได้ (ชั่วคราว)
    return res.status(200).json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
};

const createLeaveRequest = async (req, res, next) => {
  try {
    // ตัวอย่าง: const created = await leaveModel.create(req.body);
    return res.status(201).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

const getLeaveById = async (req, res, next) => {
  try {
    const { id } = req.params;
    // const item = await leaveModel.findById(id);
    return res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

const updateLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    // const updated = await leaveModel.update(id, req.body);
    return res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
};

const deleteLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const requestId = parseInt(id);

    // 1. ค้นหาข้อมูลใบลาใน Database ก่อนเพื่อตรวจสอบว่ามีไฟล์แนบหรือไม่
    const request = await prisma.leaveRequest.findUnique({
      where: { requestId: requestId },
      select: { attachmentUrl: true } // ดึงมาเฉพาะชื่อไฟล์
    });

    if (!request) {
      throw CustomError.notFound('ไม่พบคำขอลาที่ต้องการลบ');
    }

    // 2. ถ้ามีชื่อไฟล์แนบ ให้ทำการลบไฟล์จริงออกจากเซิร์ฟเวอร์
    if (request.attachmentUrl) {
      // สร้าง Path เต็มไปยังไฟล์ (ย้อนกลับไป 2 ระดับจากโฟลเดอร์ controllers ไปยัง root)
      const filePath = path.join(__dirname, '../../uploads', request.attachmentUrl);

      // ตรวจสอบก่อนว่าไฟล์มีอยู่จริงไหม แล้วค่อยสั่งลบ
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error("เกิดข้อผิดพลาดในการลบไฟล์จริง:", err);
            // เราจะไม่หยุดการทำงาน (next) ตรงนี้ เพื่อให้ Database ยังคงถูกลบได้
          } else {
            console.log("ลบไฟล์แนบสำเร็จ:", request.attachmentUrl);
          }
        });
      }
    }

    // 3. ลบข้อมูลออกจาก Database
    await prisma.leaveRequest.delete({
      where: { requestId: requestId }
    });

    res.status(200).json({ 
      success: true, 
      message: 'ลบคำขอลาและไฟล์แนบที่เกี่ยวข้องเรียบร้อยแล้ว' 
    });

  } catch (error) {
    next(error);
  }
};

const previewCalculateDays = async (req, res, next) => {
    try {
        const { startDate, endDate, startDuration, endDuration } = req.query;
        // เรียกใช้ calculateTotalDays จาก leaveService ที่คุณมีอยู่แล้ว
        const totalDays = await leaveService.calculateTotalDays(
            startDate, 
            endDate, 
            startDuration || 'Full', 
            endDuration || 'Full'
        );
        res.status(200).json({ success: true, totalDays });
    } catch (error) { 
        next(error); 
    }
};

// ต้อง export ฟังก์ชันที่ route เรียกใช้
module.exports = {
  requestLeave, 
  getMyRequests, 
  cancelLeaveRequest,
  getAllPendingRequests, 
  getRequestDetail, 
  handleApproval,
  getMyQuotas,
  getAllLeaveRequests,
  getAllRequests,
  createLeaveRequest,
  getLeaveById,
  updateLeaveRequest,
  deleteLeaveRequest,
  previewCalculateDays,
};