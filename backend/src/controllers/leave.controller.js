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

        // 🔥 เพิ่มการตรวจสอบ Overlap ที่นี่
        await leaveService.checkLeaveOverlap(employeeId, startDate, endDate);

        // --- Logic เดิมหลังจากนี้ ---
        const totalDaysRequested = await leaveService.calculateTotalDays(startDate, endDate, startDuration, endDuration);
        const requestYear = moment(startDate).year(); 
        
        await leaveService.checkQuotaAvailability(employeeId, parseInt(leaveTypeId), totalDaysRequested, requestYear);

        const newRequest = await leaveModel.createLeaveRequest({
            employeeId,
            leaveTypeId: parseInt(leaveTypeId),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalDaysRequested,
            startDuration: startDuration || 'Full',
            endDuration: endDuration || 'Full',
            reason: reason || null,
            status: 'Pending',
        });

        res.status(201).json({ success: true, message: 'ส่งคำขอลาสำเร็จ', request: newRequest });
    } catch (error) {
        if (error.statusCode === 409) {
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
            throw CustomError.badRequest('Request not found or already processed.');
        }

        const result = await prisma.$transaction(async (tx) => {
            const requestedDays = originalRequest.totalDaysRequested.toNumber();
            const requestYear = moment(originalRequest.startDate).year();
            const leaveTypeId = originalRequest.leaveTypeId;
            const employeeId = originalRequest.employeeId;

            let finalStatus = 'Rejected';
            let quotaDelta = 0; 

            if (action === 'approve') {
                // Check Quota within Transaction (for safety/concurrency)
                const isPaid = (await tx.leaveType.findUnique({ where: { leaveTypeId } }))?.isPaid;

                if (isPaid) {
                    const quota = await tx.leaveQuota.findUnique({
                        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: requestYear } },
                    });
                    
                    if (quota) {
                        const availableDays = parseFloat((quota.totalDays.toNumber() - quota.usedDays.toNumber()).toFixed(2));
                        if (requestedDays > availableDays) {
                            // Throw error to rollback transaction
                            throw CustomError.conflict("Transaction failed: Insufficient quota detected during approval.");
                        }
                    }
                }

                finalStatus = 'Approved';
                quotaDelta = requestedDays; 
                
                // Update usedDays
                if (quotaDelta > 0 && isPaid) {
                     await leaveService.updateUsedQuota(employeeId, leaveTypeId, quotaDelta, requestYear, tx);
                }
            } 
            
            const updatedRequest = await leaveModel.updateRequestStatusTx(requestId, finalStatus, hrId, tx);
            return updatedRequest;
        });

        // Notification: แจ้ง Employee ถึงสถานะคำขอ
        notificationService.sendNotification(result.employeeId, {
            type: 'RequestStatusUpdate',
            message: `Your leave request (ID: ${result.requestId}) has been ${result.status.toLowerCase()}.`,
            requestId: result.requestId,
            status: result.status
        });

        res.status(200).json({ success: true, message: `Leave request ${result.status.toLowerCase()} successfully.`, request: result });
    } catch (error) { next(error); }
};

const getMyQuotas = async (req, res, next) => {
    try {
        const employeeId = req.user.employeeId;
        const currentYear = moment().year();

        const quotas = await prisma.leaveQuota.findMany({
            where: {
                employeeId,
                year: currentYear
            },
            include: { leaveType: true },
            orderBy: { leaveTypeId: 'asc' }
        });
        
        // คำนวณ Available Days ที่ Frontend ต้องการ
        const formattedQuotas = quotas.map(q => ({
            ...q,
            totalDays: parseFloat(q.totalDays.toFixed(2)),
            usedDays: parseFloat(q.usedDays.toFixed(2)),
            availableDays: parseFloat((q.totalDays - q.usedDays).toFixed(2)),
        }));

        res.status(200).json({ success: true, quotas: formattedQuotas });
    } catch (error) { next(error); }
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