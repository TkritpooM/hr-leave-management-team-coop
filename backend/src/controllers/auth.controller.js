// backend/src/controllers/auth.controller.js
const prisma = require('../models/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authModel = require('../models/auth.model');
const CustomError = require('../utils/customError');

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
      role: role === 'HR' ? 'HR' : 'Worker',
      joiningDate: new Date(joiningDate),
    };

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
        role: employee.role,
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
        role: true,
        joiningDate: true,
        isActive: true,
        profileImageUrl: true,
      }
    });
    res.status(200).json({ success: true, user });
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
        role: true
      }
    });

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

    res.status(200).json({ success: true, message: "อัปเดตข้อมูลสำเร็จ", user: updatedUser });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
};
