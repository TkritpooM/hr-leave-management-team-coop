// backend/src/controllers/leave.controller.js

const prisma = require('../models/prisma');
const leaveService = require('../services/leave.service');
const leaveModel = require('../models/leave.model');
const notificationService = require('../services/notification.service');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');

const requestLeave = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.user.employeeId);
        const { startDate, endDate, leaveTypeId, startDuration, endDuration, reason } = req.body;

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

                    const availableDays = parseFloat((quota.totalDays.toNumber() - quota.usedDays.toNumber()).toFixed(2));
                    if (requestedDays > availableDays) {
                        throw CustomError.conflict(`โควต้าไม่พออนุมัติ (คงเหลือ: ${availableDays}, ต้องการใช้: ${requestedDays})`);
                    }

                    await tx.leaveQuota.update({
                        where: { quotaId: quota.quotaId },
                        data: { usedDays: { increment: requestedDays } }
                    });
                }
                finalStatus = 'Approved';
            } 
            
            // 1. อัปเดตสถานะของใบลา
            const updatedRequest = await tx.leaveRequest.update({
                where: { requestId },
                data: {
                    status: finalStatus,
                    approvedByHrId: hrId,
                    approvalDate: new Date(),
                }
            });

            // 🆕 2. สร้างการแจ้งเตือนลงฐานข้อมูล (Database)
            // เพื่อให้ Worker สามารถกลับมาอ่านย้อนหลังในหน้า Notification ได้
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

        // 🆕 3. ส่ง Notification แบบ Real-time ผ่าน WebSocket
        // ถ้า Worker ออนไลน์อยู่ แจ้งเตือนจะเด้งขึ้นทันทีและเลข Badge ใน Sidebar จะอัปเดต
        notificationService.sendNotification(result.updatedRequest.employeeId, {
            type: 'NOTIFICATION', // ส่ง type ให้ตรงกับที่ Service/Frontend คาดหวัง
            data: result.newNotification
        });

        // 🆕 4. อัปเดตเลข Badge ใน Sidebar ของ Worker (ผ่าน WebSocket STATUS หรือการส่ง Noti ปกติ)
        // เพื่อให้ Worker ทราบว่ามีข้อความใหม่ที่ยังไม่ได้อ่าน
        
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

const getMyQuotas = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.user.employeeId);
        const currentYear = moment().year();

        // ค้นหาโควต้า
        const quotas = await prisma.leaveQuota.findMany({
            where: {
                employeeId: employeeId,
                year: currentYear
            },
            include: { leaveType: true } // ต้องมีบรรทัดนี้เพื่อเอาชื่อประเภทการลามาแสดง
        });
        
        // Debug: ดูใน Terminal ของ Backend ว่าเจอข้อมูลไหม
        // console.log(`Searching quota for Emp: ${employeeId}, Year: ${currentYear}, Found: ${quotas.length}`);

        const formattedQuotas = quotas.map(q => ({
            ...q,
            totalDays: parseFloat(q.totalDays.toString()),
            usedDays: parseFloat(q.usedDays.toString()),
            availableDays: parseFloat((parseFloat(q.totalDays) - parseFloat(q.usedDays)).toFixed(2)),
        }));

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
    // await leaveModel.delete(id);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ต้อง export ฟังก์ชันที่ route เรียกใช้
module.exports = {
  requestLeave, 
  getMyRequests, 
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
};