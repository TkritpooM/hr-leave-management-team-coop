// backend/src/controllers/leave.controller.js
const prisma = require('../models/prisma');
const fs = require('fs');
const path = require('path');
const leaveService = require('../services/leave.service');
const leaveModel = require('../models/leave.model');
const notificationService = require('../services/notification.service');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');

// ✅ AUDIT
const { logAudit } = require("../utils/auditLogger");
const { getClientIp } = require("../utils/requestMeta");
const safeAudit = async (payload) => {
  try { await logAudit(payload); } catch (e) { console.error("AUDIT_LOG_FAIL:", e?.message || e); }
};

/** ---------------------------
 * ✅ Helper: keep response shape same (status 200 for handled business errors)
 * but message becomes i18n key, with optional meta for interpolation
 * -------------------------- */
const respondFail = (res, messageKey, meta = undefined, statusCode = undefined) => {
  return res.status(200).json({
    success: false,
    message: messageKey,
    meta: meta || undefined,
    statusCode: statusCode || undefined
  });
};

/**
 * Submit a new leave request
 */
const requestLeave = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.user.employeeId);
    const { startDate, endDate, leaveTypeId, startDuration, endDuration, reason } = req.body;
    const attachmentUrl = req.file ? req.file.filename : null;

    // 1. Validations (Basic)
    await leaveService.checkLeaveGapPolicy(employeeId, startDate);
    await leaveService.checkLeaveOverlap(employeeId, startDate, endDate);

    // 🔥 FIX: ดึง Setting จาก Database และแปลงค่า
    const policy = await prisma.attendancePolicy.findFirst();

    // Default เป็น จันทร์-ศุกร์ (1-5) ไว้ก่อนเผื่อไม่มี Policy
    let activeWorkDays = [1, 2, 3, 4, 5];

    // 🔥 ถ้ามีข้อมูลใน DB ให้แปลงจาก String "mon,tue,..." เป็น Array ตัวเลข [1, 2, ...]
    if (policy && policy.workingDays) {
      const dayMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
      activeWorkDays = policy.workingDays
        .split(',')
        .map(d => dayMap[d.trim().toLowerCase()])
        .filter(n => n !== undefined);
    }

    // 🔥 Loop เช็ควันหยุดตามค่า activeWorkDays ที่แปลงแล้ว
    const startM = moment(startDate);
    const endM = moment(endDate);
    let curr = startM.clone();

    while (curr.isSameOrBefore(endM, 'day')) {
      const dayOfWeek = curr.day(); // 0=Sun, 1=Mon, ...

      // ถ้าวันที่ขอลา ไม่อยู่ในลิสต์วันทำงานที่ตั้งค่าไว้
      if (!activeWorkDays.includes(dayOfWeek)) {
        // ✅ i18n key + meta
        return respondFail(
          res,
          "errors.leave.requestOnNonWorkingDay",
          {
            dayName: curr.format('dddd'),
            dateText: curr.format('DD MMM'),
            fullText: curr.format('dddd, DD MMM'),
            date: curr.format('YYYY-MM-DD')
          },
          400
        );
      }
      curr.add(1, 'days');
    }
    // -----------------------------------------------------

    const totalDaysRequested = await leaveService.calculateTotalDays(startDate, endDate, startDuration, endDuration);

    if (totalDaysRequested <= 0) {
      return respondFail(res, "errors.leave.requestedDaysMustBeGreaterThanZero", undefined, 400);
    }

    const requestYear = moment(startDate).year();
    await leaveService.checkQuotaAvailability(employeeId, parseInt(leaveTypeId), totalDaysRequested, requestYear);

    // 2. Database Transaction
    const result = await prisma.$transaction(async (tx) => {
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
          attachmentUrl,
          status: 'Pending',
        },
        include: {
          employee: { select: { firstName: true, lastName: true } },
          leaveType: { select: { typeName: true } }
        }
      });

      const allHR = await tx.employee.findMany({
        where: { role: 'HR', isActive: true },
        select: { employeeId: true }
      });

      // 3. Create Notifications for HRs
      if (allHR.length > 0) {
        const empName = `${newRequest.employee.firstName} ${newRequest.employee.lastName}`;

        // ✅ Store message as i18n key + meta (frontend should render via t(message, meta))
        await tx.notification.createMany({
          data: allHR.map(hr => ({
            employeeId: hr.employeeId,
            notificationType: 'NewRequest',
            message: "New notifications",
            meta: {
              leaveTypeName: newRequest.leaveType.typeName,
              employeeName: empName
            },
            relatedRequestId: newRequest.requestId
          }))
        });
      }

      return { newRequest, allHR };
    });

    // 4. Send Real-time WebSocket to HRs
    result.allHR.forEach(hr => {
      notificationService.sendNotification(hr.employeeId, {
        type: 'NOTIFICATION',
        data: {
          type: 'NewRequest',
          // ✅ i18n message + meta
          message: "notifications.leave.newRequestReceivedWithId",
          meta: { requestId: result.newRequest.requestId },
          requestId: result.newRequest.requestId
        }
      });
    });

    // ✅ AUDIT: create leave request
    await safeAudit({
      action: "LEAVE_REQUEST_CREATE",
      entity: "LeaveRequest",
      entityKey: `LeaveRequest:${result.newRequest.requestId}`,
      oldValue: null,
      newValue: {
        requestId: result.newRequest.requestId,
        employeeId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate,
        endDate,
        startDuration: startDuration || 'Full',
        endDuration: endDuration || 'Full',
        totalDaysRequested,
        hasAttachment: !!attachmentUrl,
        reason: reason || null,
        status: "Pending",
      },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      message: "success.leave.requestSubmittedAndHrNotified",
      request: result.newRequest
    });
  } catch (error) {
    if (error.statusCode === 409 || error.statusCode === 400) {
      return res.status(200).json({
        success: false,
        message: error.message,
        meta: error.meta || undefined,
        statusCode: error.statusCode
      });
    }
    next(error);
  }
};

/**
 * Get leave requests for the logged-in employee
 */
const getMyRequests = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.user.employeeId);
    const requests = await prisma.leaveRequest.findMany({
      where: { employeeId },
      include: {
        leaveType: true,
        // ✅ เพิ่มคนที่อนุมัติ (HR)
        approvedByHR: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' }
    });

    res.status(200).json({ success: true, requests });
  } catch (error) {
    console.error("DEBUG - getMyRequests Error:", error);
    next(error);
  }
};

/**
 * Cancel a pending leave request
 */
const cancelLeaveRequest = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.user.employeeId);
    const requestId = parseInt(req.params.requestId);

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { requestId },
      select: { employeeId: true, status: true, attachmentUrl: true }
    });

    if (!leaveRequest) throw CustomError.notFound('errors.leave.requestNotFound');
    if (leaveRequest.employeeId !== employeeId) throw CustomError.forbidden('errors.leave.canOnlyCancelOwnRequest');

    if (leaveRequest.status !== 'Pending') {
      return respondFail(
        res,
        "errors.leave.cannotCancelAlreadyProcessed",
        { status: leaveRequest.status },
        400
      );
    }

    const oldSnapshot = { status: leaveRequest.status, hasAttachment: !!leaveRequest.attachmentUrl };

    // Delete physical file
    if (leaveRequest.attachmentUrl) {
      const filePath = path.join(__dirname, '../../uploads', leaveRequest.attachmentUrl);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => { if (err) console.error("File deletion error:", err); });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { requestId },
        data: { status: 'Cancelled', attachmentUrl: null }
      });

      await tx.notification.deleteMany({
        where: { relatedRequestId: requestId, notificationType: 'NewRequest' }
      });
    });

    // Notify HR via WebSocket for UI refresh
    const allHR = await prisma.employee.findMany({
      where: { role: 'HR', isActive: true },
      select: { employeeId: true }
    });

    allHR.forEach(hr => {
      notificationService.sendNotification(hr.employeeId, {
        type: 'UPDATE_SIGNAL',
        action: 'REFRESH_LEAVE_LIST',
        requestId
      });
    });

    // ✅ AUDIT: cancel leave request
    await safeAudit({
      action: "LEAVE_REQUEST_CANCEL",
      entity: "LeaveRequest",
      entityKey: `LeaveRequest:${requestId}`,
      oldValue: oldSnapshot,
      newValue: { status: "Cancelled", hasAttachment: false },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({
      success: true,
      message: "success.leave.requestCancelledAndAttachmentRemoved"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get all pending requests
 */
const getAllPendingRequests = async (req, res, next) => {
  try {
    const requests = await prisma.leaveRequest.findMany({
      where: { status: 'Pending' },
      include: { employee: { select: { employeeId: true, firstName: true, lastName: true } }, leaveType: true },
      orderBy: { requestedAt: 'asc' },
    });
    res.status(200).json({ success: true, requests });
  } catch (error) { next(error); }
};

/**
 * Get single request details
 */
const getRequestDetail = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const request = await leaveModel.getLeaveRequestById(requestId);

    if (!request) throw CustomError.notFound('errors.leave.requestNotFound');

    if (req.user.role !== 'HR' && req.user.employeeId !== request.employeeId) {
      throw CustomError.forbidden('errors.common.accessDenied');
    }

    res.status(200).json({ success: true, request });
  } catch (error) { next(error); }
};

/**
 * Admin: Approve or Reject a request
 */
const handleApproval = async (req, res, next) => {
  try {
    const hrId = Number(req.user.employeeId);
    const requestId = parseInt(req.params.requestId);
    const { action } = req.body;

    const originalRequest = await leaveModel.getLeaveRequestById(requestId);
    if (!originalRequest || originalRequest.status !== 'Pending') {
      throw CustomError.badRequest('errors.leave.requestNotFoundOrProcessed');
    }

    const oldStatus = originalRequest.status;
    const oldApprovedBy = originalRequest.approvedByHrId || null;

    const result = await prisma.$transaction(async (tx) => {
      const requestedDays = originalRequest.totalDaysRequested.toNumber();
      const requestYear = moment(originalRequest.startDate).year();
      const { leaveTypeId, employeeId } = originalRequest;

      let finalStatus = 'Rejected';

      if (action === 'approve') {
        // 1. ดึงข้อมูลโควต้าของพนักงานสำหรับประเภทการลานี้ในปีนี้ (ถ้ามี)
        const quota = await tx.leaveQuota.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: requestYear } },
        });

        // 2. ถ้ามีการตั้งค่าโควต้าไว้ (ไม่ว่าจะเป็น Paid หรือ Unpaid) ให้คำนวณและหักยอด
        if (quota) {
          const availableDays = parseFloat(
            (
              quota.totalDays.toNumber() +
              quota.carriedOverDays.toNumber() -
              quota.usedDays.toNumber()
            ).toFixed(2)
          );

          if (requestedDays > availableDays) {
            // ✅ i18n key + meta (keep same logic: conflict)
            throw CustomError.conflict(
              "errors.leave.insufficientQuotaOnApproval",
              { availableDays, requestedDays }
            );
          }

          // อัปเดตยอดการใช้งาน (หักโควต้า)
          await tx.leaveQuota.update({
            where: { quotaId: quota.quotaId },
            data: { usedDays: { increment: requestedDays } }
          });
        }

        finalStatus = 'Approved';
      }

      const updatedRequest = await tx.leaveRequest.update({
        where: { requestId },
        data: { status: finalStatus, approvedByHrId: hrId, approvalDate: new Date() }
      });

      const newNotification = await tx.notification.create({
        data: {
          employeeId,
          notificationType: finalStatus, // 'Approved' or 'Rejected'
          // ✅ i18n key + meta
          message: "notifications.leave.requestStatusUpdatedWithId",
          meta: { requestId, status: finalStatus },
          relatedRequestId: requestId
        }
      });

      return { updatedRequest, newNotification };
    });

    notificationService.sendNotification(result.updatedRequest.employeeId, {
      type: 'NOTIFICATION',
      data: result.newNotification
    });

    // ✅ AUDIT: approve/reject
    await safeAudit({
      action: action === "approve" ? "LEAVE_REQUEST_APPROVE" : "LEAVE_REQUEST_REJECT",
      entity: "LeaveRequest",
      entityKey: `LeaveRequest:${requestId}`,
      oldValue: { status: oldStatus, approvedByHrId: oldApprovedBy },
      newValue: {
        status: result.updatedRequest.status,
        approvedByHrId: hrId,
        approvalDate: result.updatedRequest.approvalDate,
      },
      performedByEmployeeId: hrId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({
      success: true,
      message: "success.leave.requestProcessed",
      meta: { status: result.updatedRequest.status.toLowerCase() },
      request: result.updatedRequest
    });
  } catch (error) {
    if (error.statusCode === 409 || error.statusCode === 400) {
      return res.status(200).json({
        success: false,
        message: error.message,
        meta: error.meta || undefined,
        statusCode: error.statusCode
      });
    }
    next(error);
  }
};

/**
 * Get leave quotas for the logged-in employee
 */
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
        availableDays: parseFloat((total + carried - used).toFixed(2)),
      };
    });

    res.status(200).json({ success: true, quotas: formattedQuotas });
  } catch (error) { next(error); }
};

/**
 * Admin: Get all leave requests with optional filters
 */
const getAllLeaveRequests = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const requests = await prisma.leaveRequest.findMany({
      where: {
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

/**
 * Calculate total days (exclude weekends/holidays) - Preview for frontend
 */
const previewCalculateDays = async (req, res, next) => {
  try {
    const { startDate, endDate, startDuration, endDuration } = req.query;
    const totalDays = await leaveService.calculateTotalDays(
      startDate, endDate, startDuration || 'Full', endDuration || 'Full'
    );
    res.status(200).json({ success: true, totalDays });
  } catch (error) { next(error); }
};

/**
 * Admin: Delete a leave request and its attachment
 */
const deleteLeaveRequest = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const requestId = parseInt(req.params.id);

    const request = await prisma.leaveRequest.findUnique({
      where: { requestId },
      select: { attachmentUrl: true, status: true, employeeId: true, leaveTypeId: true }
    });

    if (!request) throw CustomError.notFound('errors.leave.requestNotFound');

    const oldSnapshot = {
      requestId,
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      status: request.status,
      hasAttachment: !!request.attachmentUrl,
    };

    if (request.attachmentUrl) {
      const filePath = path.join(__dirname, '../../uploads', request.attachmentUrl);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => { if (err) console.error("File deletion error:", err); });
      }
    }

    await prisma.leaveRequest.delete({ where: { requestId } });

    // ✅ AUDIT: delete leave request
    await safeAudit({
      action: "LEAVE_REQUEST_DELETE",
      entity: "LeaveRequest",
      entityKey: `LeaveRequest:${requestId}`,
      oldValue: oldSnapshot,
      newValue: null,
      performedByEmployeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({
      success: true,
      message: "success.leave.requestAndAttachmentDeleted"
    });
  } catch (error) { next(error); }
};

// Generic/Internal stub functions (if required by routes)
const getAllRequests = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: [] }); }
  catch (err) { next(err); }
};

const createLeaveRequest = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: null }); }
  catch (err) { next(err); }
};

const getLeaveById = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: null }); }
  catch (err) { next(err); }
};

const updateLeaveRequest = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: null }); }
  catch (err) { next(err); }
};

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
