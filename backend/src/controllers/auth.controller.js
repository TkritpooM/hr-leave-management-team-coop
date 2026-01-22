// backend/src/controllers/auth.controller.js
const prisma = require('../models/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authModel = require('../models/auth.model');
const CustomError = require('../utils/customError');
const notificationService = require('../services/notification.service');

// ✅ AUDIT
const { logAudit } = require("../utils/auditLogger");
const { getClientIp } = require("../utils/requestMeta");
const safeAudit = async (payload) => {
  try { await logAudit(payload); } catch (e) { console.error("AUDIT_LOG_FAIL:", e?.message || e); }
};

const SALT_ROUNDS = 10;

const generateToken = (employee) => {
  const payload = {
    employeeId: employee.employeeId,
    role: employee.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// --- Controller for Registration ---
const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, joiningDate, role } = req.body;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const newEmployeeData = {
      email,
      passwordHash,
      firstName,
      lastName,
      roleId: role === 'HR' ? (await prisma.role.findUnique({ where: { roleName: 'HR' } }))?.roleId : (await prisma.role.findUnique({ where: { roleName: 'Worker' } }))?.roleId,
      joiningDate: new Date(joiningDate),
    };

    // Safety check if roles not seeded
    if (!newEmployeeData.roleId) throw new Error("System Roles not found. Please contact admin.");

    const employee = await authModel.registerEmployee(newEmployeeData);

    const token = generateToken(employee);

    // ✅ AUDIT: register
    await safeAudit({
      action: "REGISTER",
      entity: "Employee",
      entityKey: `Employee:${employee.employeeId}`,
      oldValue: null,
      newValue: {
        employeeId: employee.employeeId,
        email: employee.email,
        role: employee.role, // role is now flattened by model
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
      performedByEmployeeId: employee.employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: {
        employeeId: employee.employeeId,
        email: employee.email,
        role: employee.role,
        firstName: employee.firstName,
        lastName: employee.lastName,
      }
    });

  } catch (error) {
    next(error);
  }
};

// --- Controller for Login ---
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const employee = await authModel.findEmployeeByEmail(email);

    if (!employee) {
      throw CustomError.unauthorized('Invalid credentials.');
    }

    if (!employee.isActive) {
      throw CustomError.forbidden('Your account is currently inactive.');
    }

    const isMatch = await bcrypt.compare(password, employee.passwordHash);

    if (!isMatch) {
      throw CustomError.unauthorized('Invalid credentials.');
    }

    const token = generateToken(employee);

    let redirectUrl = '/worker/dashboard';
    if (employee.role === 'HR') {
      redirectUrl = '/hr/dashboard';
    }

    // ✅ AUDIT: login success
    await safeAudit({
      action: "LOGIN_SUCCESS",
      entity: "Employee",
      entityKey: `Employee:${employee.employeeId}`,
      oldValue: null,
      newValue: { role: employee.role },
      performedByEmployeeId: employee.employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      redirectUrl,
      user: {
        employeeId: employee.employeeId,
        email: employee.email,
        role: employee.role,
        firstName: employee.firstName,
        lastName: employee.lastName,
      }
    });

  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId;
    const user = await prisma.employee.findUnique({
      where: { employeeId },
      select: {
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        email: true,
        role: { select: { roleName: true } },
        joiningDate: true,
        isActive: true,
        profileImageUrl: true,
        department: {
          select: {
            deptName: true
          }
        }
      }
    });
    // Flatten role
    const flatUser = user ? { ...user, role: user.role?.roleName } : null;
    res.status(200).json({ success: true, user: flatUser });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const employeeId = Number(req.user.employeeId);
    const { firstName, lastName, currentPassword, newPassword } = req.body;

    const oldUser = await prisma.employee.findUnique({
      where: { employeeId },
      select: { employeeId: true, firstName: true, lastName: true }
    });

    let updateData = { firstName, lastName };

    let passwordChanged = false;
    if (newPassword) {
      const user = await prisma.employee.findUnique({ where: { employeeId } });

      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" });
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
      passwordChanged = true;
    }

    const updatedUser = await prisma.employee.update({
      where: { employeeId },
      data: updateData,
      select: {
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { roleName: true } }
      }
    });

    const flatUpdatedUser = { ...updatedUser, role: updatedUser.role?.roleName };

    // ✅ AUDIT: profile update
    await safeAudit({
      action: "PROFILE_UPDATE",
      entity: "Employee",
      entityKey: `Employee:${employeeId}`,
      oldValue: oldUser,
      newValue: {
        employeeId,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        passwordChanged,
      },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: "อัปเดตข้อมูลสำเร็จ", user: flatUpdatedUser });
  } catch (error) {
    next(error);
  }
};

// --- ฟังก์ชันยื่นคำร้อง (พนักงาน -> HR) ---
const requestProfileUpdate = async (req, res, next) => {
  try {
    const employeeId = Number(req.user.employeeId);
    const { newFirstName, newLastName, reason } = req.body;

    // ตรวจสอบคำร้อง Pending เดิม (คงเดิม)
    const pendingRequest = await prisma.profileUpdateRequest.findFirst({
      where: { employeeId, status: 'Pending' }
    });

    if (pendingRequest) {
      return res.status(400).json({ success: false, message: "You already have pending request." });
    }

    const attachmentUrl = req.file ? req.file.filename : null;

    // ✅ ใช้ Transaction เพื่อสร้างทั้ง Request และ Notification พร้อมกัน
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { employeeId } });

      const request = await tx.profileUpdateRequest.create({
        data: {
          employeeId,
          oldFirstName: employee.firstName,
          oldLastName: employee.lastName,
          newFirstName,
          newLastName,
          reason,
          attachmentUrl
        }
      });

      // ดึงรายชื่อ HR ที่ Active
      const allHR = await tx.employee.findMany({
        where: { role: { roleName: 'HR' }, isActive: true },
        select: { employeeId: true }
      });

      // สร้างแจ้งเตือนใน DB สำหรับ HR
      if (allHR.length > 0) {
        await tx.notification.createMany({
          data: allHR.map(hr => ({
            employeeId: hr.employeeId,
            notificationType: 'NewRequest', // ใช้ Type เดียวกับระบบลาเพื่อให้ UI เดิมทำงานได้
            message: `New Profile Update request from ${employee.firstName} ${employee.lastName} (ID: ${request.requestId})`,
            relatedProfileRequestId: request.requestId,
          }))
        });
      }

      return { request, allHR };
    });

    // ✅ ส่ง WebSocket สัญญาณหา HR ทุกคน
    result.allHR.forEach(hr => {
      notificationService.sendNotification(hr.employeeId, {
        type: 'NOTIFICATION',
        data: { type: 'NewRequest', message: `New profile request (ID: ${result.request.requestId})` }
      });
    });

    // AUDIT (คงเดิม)
    await safeAudit({
      action: "PROFILE_UPDATE_REQUEST_SUBMIT",
      entity: "ProfileUpdateRequest",
      entityKey: `Request:${result.request.requestId}`,
      oldValue: null,
      newValue: { newFirstName, newLastName, reason },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ success: true, message: "ยื่นคำร้องและแจ้งเตือน HR แล้ว", request: result.request });
  } catch (error) { next(error); }
};

// ดึงรายการคำร้องทั้งหมด (สำหรับหน้าตาราง HR)
const getAllProfileRequests = async (req, res, next) => {
  try {
    const requests = await prisma.profileUpdateRequest.findMany({
      where: { status: 'Pending' },
      include: { employee: true },
      orderBy: { requestedAt: 'desc' }
    });
    res.json({ success: true, requests });
  } catch (error) { next(error); }
};

// --- ฟังก์ชันอนุมัติ/ปฏิเสธ (HR -> พนักงาน) ---
const handleProfileApproval = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;
    const hrId = req.user.employeeId;

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.profileUpdateRequest.findUnique({
        where: { requestId: Number(requestId) }
      });

      if (!request) throw new Error("คำร้องไม่ถูกต้อง");

      let finalStatus = action === 'approve' ? 'Approved' : 'Rejected';

      if (action === 'approve') {
        await tx.employee.update({
          where: { employeeId: request.employeeId },
          data: { firstName: request.newFirstName, lastName: request.newLastName }
        });
      }

      const updatedRequest = await tx.profileUpdateRequest.update({
        where: { requestId: request.requestId },
        data: { status: finalStatus, approvedByHrId: hrId, actionDate: new Date() }
      });

      // ✅ สร้างแจ้งเตือนกลับหาพนักงานเจ้าของเรื่อง
      const newNoti = await tx.notification.create({
        data: {
          employeeId: request.employeeId,
          notificationType: finalStatus,
          message: `Your profile update request has been ${finalStatus.toLowerCase()} (ID: ${request.requestId}).`,
          relatedProfileRequestId: request.requestId,
        }
      });

      return { updatedRequest, newNoti };
    });

    // ✅ ส่ง WebSocket สัญญาณหาพนักงาน
    notificationService.sendNotification(result.updatedRequest.employeeId, {
      type: 'NOTIFICATION',
      data: result.newNoti
    });

    // AUDIT (คงเดิม)
    await safeAudit({
      action: action === "approve" ? "PROFILE_UPDATE_APPROVED" : "PROFILE_UPDATE_REJECTED",
      entity: "Employee",
      entityKey: `Employee:${result.updatedRequest.employeeId}`,
      oldValue: { firstName: result.updatedRequest.oldFirstName, lastName: result.updatedRequest.oldLastName },
      newValue: { firstName: result.updatedRequest.newFirstName, lastName: result.updatedRequest.newLastName },
      performedByEmployeeId: hrId,
      ipAddress: getClientIp(req),
    });

    res.json({ success: true, message: `ดำเนินการสำเร็จ` });
  } catch (error) { next(error); }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  requestProfileUpdate,
  getAllProfileRequests,
  handleProfileApproval,
};
