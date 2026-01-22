// backend/src/controllers/admin.controller.js
const prisma = require('../models/prisma');
const bcrypt = require('bcrypt');
const CustomError = require('../utils/customError');

// ✅ AUDIT
const { logAudit } = require("../utils/auditLogger");
const { getClientIp } = require("../utils/requestMeta");
const safeAudit = async (payload) => {
  try { await logAudit(payload); } catch (e) { console.error("AUDIT_LOG_FAIL:", e?.message || e); }
};

// --- 🆕 Employee Management (NEW) ---

// ดึงรายชื่อพนักงานทั้งหมดสำหรับหน้า Employees
const getAllEmployees = async (req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      select: {
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        email: true,
        role: { select: { roleName: true } },
        joiningDate: true,
        isActive: true,
        department: {
          select: {
            deptId: true,
            deptName: true
          }
        }
      },
      orderBy: { employeeId: 'asc' }
    });
    // Flatten roles
    const flatEmployees = employees.map(e => ({ ...e, role: e.role?.roleName }));
    res.status(200).json({ success: true, employees: flatEmployees });
  } catch (error) { next(error); }
};

// ดึง Quota เฉพาะของพนักงานคนนั้นๆ (ใช้ตอนเปิด Modal Set Quota)
const getEmployeeQuota = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const year = new Date().getFullYear(); // หรือรับจาก query ก็ได้

    const quotas = await prisma.leaveQuota.findMany({
      where: { employeeId, year },
      include: { leaveType: true }
    });
    res.status(200).json({ success: true, quotas });
  } catch (error) { next(error); }
};

// อัปเดต Quota แบบหลายรายการพร้อมกัน (ใช้ตอนกด Save ใน Modal)
const updateEmployeeQuotaBulk = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const employeeId = parseInt(req.params.employeeId);
    const { quotas } = req.body; // รับเป็น [{leaveTypeId: 1, totalDays: 10}, ...]
    const year = new Date().getFullYear();

    // ✅ AUDIT: old snapshot
    const oldQuotas = await prisma.leaveQuota.findMany({
      where: { employeeId, year },
      select: { leaveTypeId: true, totalDays: true }
    });

    // ใช้ Transaction เพื่อให้มั่นใจว่าข้อมูลอัปเดตครบทุกแถว
    await prisma.$transaction(
      quotas.map((q) =>
        prisma.leaveQuota.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId,
              leaveTypeId: q.leaveTypeId,
              year
            }
          },
          update: { totalDays: parseFloat(q.totalDays) },
          create: {
            employeeId,
            leaveTypeId: q.leaveTypeId,
            year,
            totalDays: parseFloat(q.totalDays),
            usedDays: 0
          }
        })
      )
    );

    // ✅ AUDIT: new snapshot
    const newQuotas = await prisma.leaveQuota.findMany({
      where: { employeeId, year },
      select: { leaveTypeId: true, totalDays: true }
    });

    await safeAudit({
      action: "EMPLOYEE_QUOTA_BULK_UPDATE",
      entity: "LeaveQuota",
      entityKey: `Employee:${employeeId}:Year:${year}`,
      oldValue: oldQuotas.map(q => ({ leaveTypeId: q.leaveTypeId, totalDays: Number(q.totalDays) })),
      newValue: newQuotas.map(q => ({ leaveTypeId: q.leaveTypeId, totalDays: Number(q.totalDays) })),
      performedByEmployeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: "Quotas updated successfully" });
  } catch (error) { next(error); }
};

// --- Leave Type Management (CRUD) ---
const getLeaveTypes = async (req, res, next) => {
  try {
    const types = await prisma.leaveType.findMany({ orderBy: { typeName: 'asc' } });
    res.status(200).json({ success: true, types });
  } catch (error) { next(error); }
};

const createLeaveType = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { typeName, isPaid, defaultDays, canCarryForward, maxCarryDays, colorCode } = req.body;
    const newType = await prisma.leaveType.create({
      data: {
        typeName,
        isPaid: isPaid !== undefined ? isPaid : true,
        defaultDays: parseFloat(defaultDays) || 0,
        canCarryForward: !!canCarryForward,
        maxCarryDays: parseFloat(maxCarryDays) || 0,
        colorCode: colorCode || "#3b82f6"
      }
    });

    await safeAudit({
      action: "LEAVE_TYPE_CREATE",
      entity: "LeaveType",
      entityKey: `LeaveType:${newType.leaveTypeId}`,
      oldValue: null,
      newValue: newType,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Leave type created.', type: newType });
  } catch (error) { next(error); }
};

const updateLeaveType = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const leaveTypeId = parseInt(req.params.leaveTypeId);
    const { typeName, isPaid, defaultDays, canCarryForward, maxCarryDays, colorCode } = req.body;

    const oldType = await prisma.leaveType.findUnique({ where: { leaveTypeId } });

    const updatedType = await prisma.leaveType.update({
      where: { leaveTypeId },
      data: {
        typeName,
        isPaid,
        defaultDays: parseFloat(defaultDays),
        canCarryForward: !!canCarryForward,
        maxCarryDays: parseFloat(maxCarryDays) || 0,
        colorCode: colorCode
      }
    });

    await safeAudit({
      action: "LEAVE_TYPE_UPDATE",
      entity: "LeaveType",
      entityKey: `LeaveType:${leaveTypeId}`,
      oldValue: oldType,
      newValue: updatedType,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Leave type updated.', type: updatedType });
  } catch (error) { next(error); }
};

const deleteLeaveType = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const leaveTypeId = parseInt(req.params.leaveTypeId);

    const oldType = await prisma.leaveType.findUnique({ where: { leaveTypeId } });

    await prisma.leaveType.delete({ where: { leaveTypeId } });

    await safeAudit({
      action: "LEAVE_TYPE_DELETE",
      entity: "LeaveType",
      entityKey: `LeaveType:${leaveTypeId}`,
      oldValue: oldType,
      newValue: null,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Leave type deleted successfully.' });
  } catch (error) {
    if (error.code === 'P2025') { return next(CustomError.notFound(`Leave type ID ${req.params.leaveTypeId} not found.`)); }
    next(error);
  }
};

// --- Leave Quota Management (CRUD เดิม) ---
const getQuotas = async (req, res, next) => {
  try {
    const quotas = await prisma.leaveQuota.findMany({
      include: { employee: { select: { employeeId: true, firstName: true, lastName: true } }, leaveType: true },
      orderBy: [{ year: 'desc' }, { employeeId: 'asc' }]
    });
    res.status(200).json({ success: true, quotas });
  } catch (error) { next(error); }
};

const createQuota = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { employeeId, leaveTypeId, year, totalDays } = req.body;

    const newQuota = await prisma.leaveQuota.create({
      data: { employeeId, leaveTypeId, year, totalDays: parseFloat(totalDays), usedDays: 0.00 }
    });

    await safeAudit({
      action: "QUOTA_CREATE",
      entity: "LeaveQuota",
      entityKey: `Quota:${newQuota.quotaId}`,
      oldValue: null,
      newValue: newQuota,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Quota assigned.', quota: newQuota });
  } catch (error) { next(error); }
};

const updateQuota = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const quotaId = parseInt(req.params.quotaId);

    const oldQuota = await prisma.leaveQuota.findUnique({ where: { quotaId } });

    const updatedQuota = await prisma.leaveQuota.update({
      where: { quotaId },
      data: { totalDays: parseFloat(req.body.totalDays) },
    });

    await safeAudit({
      action: "QUOTA_UPDATE",
      entity: "LeaveQuota",
      entityKey: `Quota:${quotaId}`,
      oldValue: oldQuota,
      newValue: updatedQuota,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Quota updated.', quota: updatedQuota });
  } catch (error) {
    if (error.code === 'P2025') { return next(CustomError.notFound(`Quota ID ${req.params.quotaId} not found.`)); }
    next(error);
  }
};

// --- Holiday Management (CRUD) ---
const getHolidays = async (req, res, next) => {
  try {
    const holidays = await prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } });
    res.status(200).json({ success: true, holidays });
  } catch (error) { next(error); }
};

const createHoliday = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { holidayDate, holidayName } = req.body;

    const newHoliday = await prisma.holiday.create({
      data: { holidayDate: new Date(holidayDate), holidayName }
    });

    await safeAudit({
      action: "HOLIDAY_CREATE",
      entity: "Holiday",
      entityKey: `Holiday:${newHoliday.holidayId}`,
      oldValue: null,
      newValue: newHoliday,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Holiday created.', holiday: newHoliday });
  } catch (error) { next(error); }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const holidayId = parseInt(req.params.holidayId);

    const oldHoliday = await prisma.holiday.findUnique({ where: { holidayId } });

    await prisma.holiday.delete({ where: { holidayId } });

    await safeAudit({
      action: "HOLIDAY_DELETE",
      entity: "Holiday",
      entityKey: `Holiday:${holidayId}`,
      oldValue: oldHoliday,
      newValue: null,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Holiday deleted successfully.' });
  } catch (error) {
    if (error.code === 'P2025') { return next(CustomError.notFound(`Holiday ID ${req.params.holidayId} not found.`)); }
    next(error);
  }
};

// 🆕 ฟังก์ชันใหม่: Sync โควต้ามาตรฐานให้พนักงานทุกคน
const syncAllEmployeesQuota = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const year = new Date().getFullYear();

    const [employees, leaveTypes] = await Promise.all([
      prisma.employee.findMany({ where: { isActive: true }, select: { employeeId: true } }),
      prisma.leaveType.findMany()
    ]);

    const operations = [];
    for (const emp of employees) {
      for (const type of leaveTypes) {
        operations.push(
          prisma.leaveQuota.upsert({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: emp.employeeId,
                leaveTypeId: type.leaveTypeId,
                year: year
              }
            },
            update: { totalDays: type.defaultDays },
            create: {
              employeeId: emp.employeeId,
              leaveTypeId: type.leaveTypeId,
              year: year,
              totalDays: type.defaultDays,
              usedDays: 0
            }
          })
        );
      }
    }

    await prisma.$transaction(operations);

    await safeAudit({
      action: "SYNC_DEFAULT_QUOTAS_ALL_EMPLOYEES",
      entity: "SystemJob",
      entityKey: `Year:${year}`,
      oldValue: null,
      newValue: { year, employees: employees.length, leaveTypes: leaveTypes.length, operations: operations.length },
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: "Synced all employees with default quotas." });
  } catch (error) { next(error); }
};

const processYearEndCarryForward = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const carryForwardTypes = await prisma.leaveType.findMany({
      where: { canCarryForward: true }
    });

    if (carryForwardTypes.length === 0) {
      return res.status(200).json({ success: true, message: "No leave types configured for carry forward." });
    }

    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { employeeId: true }
    });

    const operations = [];

    for (const emp of employees) {
      for (const type of carryForwardTypes) {
        const currentQuota = await prisma.leaveQuota.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: emp.employeeId,
              leaveTypeId: type.leaveTypeId,
              year: currentYear
            }
          }
        });

        let carryAmount = 0;
        if (currentQuota) {
          const remaining = currentQuota.totalDays - currentQuota.usedDays;
          carryAmount = Math.max(0, Math.min(remaining, type.maxCarryDays));
        }

        operations.push(
          prisma.leaveQuota.upsert({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: emp.employeeId,
                leaveTypeId: type.leaveTypeId,
                year: nextYear
              }
            },
            update: {
              carriedOverDays: carryAmount,
              totalDays: type.defaultDays
            },
            create: {
              employeeId: emp.employeeId,
              leaveTypeId: type.leaveTypeId,
              year: nextYear,
              carriedOverDays: carryAmount,
              totalDays: type.defaultDays,
              usedDays: 0
            }
          })
        );
      }
    }

    await prisma.$transaction(operations);

    await safeAudit({
      action: "PROCESS_YEAR_END_CARRY_FORWARD",
      entity: "SystemJob",
      entityKey: `From:${currentYear}:To:${nextYear}`,
      oldValue: null,
      newValue: { currentYear, nextYear, employees: employees.length, carryForwardTypes: carryForwardTypes.length, operations: operations.length },
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Successfully processed carry forward from ${currentYear} to ${nextYear}.`
    });
  } catch (error) {
    next(error);
  }
};

// 1. เพิ่มพนักงานใหม่โดย HR
const createEmployee = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { email, password, firstName, lastName, joiningDate, role, departmentId } = req.body;

    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ success: false, message: "Email is already in use." });

    const passwordHash = await bcrypt.hash(password, 10);
    const year = new Date().getFullYear();

    // Find roleId
    const targetRole = role || 'Worker';
    const roleRecord = await prisma.role.findUnique({ where: { roleName: targetRole } });
    if (!roleRecord) return res.status(400).json({ success: false, message: `Role ${targetRole} not found.` });

    const result = await prisma.$transaction(async (tx) => {
      const newEmp = await tx.employee.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          roleId: roleRecord.roleId,
          joiningDate: new Date(joiningDate),
          isActive: true,
          departmentId: departmentId ? parseInt(departmentId) : undefined
        },
        include: { role: true }
      });

      const leaveTypes = await tx.leaveType.findMany();
      const quotas = leaveTypes.map(type => ({
        employeeId: newEmp.employeeId,
        leaveTypeId: type.leaveTypeId,
        year: year,
        totalDays: type.defaultDays,
        usedDays: 0
      }));

      await tx.leaveQuota.createMany({ data: quotas });
      return newEmp;
    });

    await safeAudit({
      action: "EMPLOYEE_CREATE",
      entity: "Employee",
      entityKey: `Employee:${result.employeeId}`,
      oldValue: null,
      newValue: {
        employeeId: flatEmp.employeeId,
        email: flatEmp.email,
        firstName: flatEmp.firstName,
        lastName: flatEmp.lastName,
        role: flatEmp.role,
        joiningDate: flatEmp.joiningDate,
        isActive: flatEmp.isActive,
      },
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    // Flatten role for response
    const flatEmp = { ...result, role: result.role?.roleName };
    res.status(201).json({ success: true, message: "Employee created and quotas assigned.", employee: flatEmp });
  } catch (error) { next(error); }
};

// 2. แก้ไขข้อมูลพนักงานโดย HR (ไม่จำเป็นต้องระบุรหัสผ่านเดิม)
const updateEmployeeByAdmin = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const employeeId = parseInt(req.params.employeeId);
    const { firstName, lastName, email, role, isActive, password, departmentId } = req.body;

    const oldEmp = await prisma.employee.findUnique({
      where: { employeeId },
      select: { employeeId: true, email: true, firstName: true, lastName: true, role: { select: { roleName: true } }, isActive: true, departmentId: true }
    });
    // Flatten oldEmp for audit
    const flatOldEmp = oldEmp ? { ...oldEmp, role: oldEmp.role?.roleName } : null;

    let updateData = {
      firstName,
      lastName,
      email,
      isActive: Boolean(isActive),
      departmentId: departmentId ? parseInt(departmentId) : null
    };

    if (role) {
      const roleRecord = await prisma.role.findUnique({ where: { roleName: role } });
      if (roleRecord) {
        updateData.roleId = roleRecord.roleId;
      }
    }

    let passwordChanged = false;
    if (password && password.trim() !== "") {
      updateData.passwordHash = await bcrypt.hash(password, 10);
      passwordChanged = true;
    }

    const updated = await prisma.employee.update({
      where: { employeeId },
      data: updateData,
      include: { role: true }
    });
    const flatUpdated = { ...updated, role: updated.role?.roleName };

    await safeAudit({
      action: "EMPLOYEE_UPDATE_BY_HR",
      entity: "Employee",
      entityKey: `Employee:${employeeId}`,
      oldValue: flatOldEmp,
      newValue: {
        employeeId: flatUpdated.employeeId,
        email: flatUpdated.email,
        firstName: flatUpdated.firstName,
        lastName: flatUpdated.lastName,
        role: flatUpdated.role,
        isActive: flatUpdated.isActive,
        passwordChanged,
      },
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: "Employee updated successfully", employee: flatUpdated });
  } catch (error) { next(error); }
};

// เพิ่มไว้ท้ายไฟล์ก่อน module.exports
const getAttendancePolicy = async (req, res, next) => {
  try {
    let policy = await prisma.attendancePolicy.findFirst();

    if (!policy) {
      policy = await prisma.attendancePolicy.create({
        data: {
          policyId: 1,
          startTime: "09:00",
          endTime: "18:00",
          graceMinutes: 5,
          workingDays: "mon,tue,wed,thu,fri",
          leaveGapDays: 0,
          specialHolidays: []
        }
      });
    }
    res.status(200).json({ success: true, policy });
  } catch (error) {
    console.error("DB Connection Error:", error);
    next(error);
  }
};

const updateAttendancePolicy = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { startTime, endTime, breakStartTime, breakEndTime, graceMinutes, workingDays, leaveGapDays, specialHolidays } = req.body;

    const oldPolicy = await prisma.attendancePolicy.findFirst();

    const policy = await prisma.attendancePolicy.upsert({
      where: { policyId: 1 },
      update: { startTime, endTime, breakStartTime, breakEndTime, graceMinutes, workingDays, leaveGapDays: parseInt(leaveGapDays) || 0, specialHolidays: specialHolidays || [] },
      create: { policyId: 1, startTime, endTime, breakStartTime, breakEndTime, graceMinutes, workingDays, leaveGapDays: parseInt(leaveGapDays) || 0, specialHolidays: specialHolidays || [] }
    });

    await safeAudit({
      action: "ATTENDANCE_POLICY_UPDATE",
      entity: "AttendancePolicy",
      entityKey: "policyId:1",
      oldValue: oldPolicy,
      newValue: policy,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: "Policy updated", policy });
  } catch (error) { next(error); }
};

// --- Role Management (CRUD) ---
const getRoles = async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { roleId: 'asc' } });
    res.status(200).json({ success: true, roles });
  } catch (error) { next(error); }
};

const createRole = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const { roleName } = req.body;

    // Check if role exists
    const existing = await prisma.role.findUnique({ where: { roleName } });
    if (existing) throw CustomError.badRequest("Role name already exists.");

    const newRole = await prisma.role.create({ data: { roleName } });

    await safeAudit({
      action: "ROLE_CREATE",
      entity: "Role",
      entityKey: `Role:${newRole.roleId}`,
      oldValue: null,
      newValue: newRole,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Role created.', role: newRole });
  } catch (error) { next(error); }
};

const updateRole = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const roleId = parseInt(req.params.roleId);
    const { roleName } = req.body;

    const oldRole = await prisma.role.findUnique({ where: { roleId } });
    if (!oldRole) throw CustomError.notFound("Role not found.");

    // Protected roles check (optional but good practice)
    if (['Admin', 'HR', 'Worker'].includes(oldRole.roleName) && oldRole.roleName !== roleName) {
      // Prevent renaming core system roles if critical logic depends on strings
      // But user wanted full CRUD, so we allow it but warn or ensure ID stability. 
      // Since logic uses IDs or strings? Logic uses roleName strings heavily!
      // Ideally we should block renaming 'Admin', 'HR', 'Worker'.
      // Let's block renaming system roles for safety.
      throw CustomError.forbidden("Cannot rename system default roles.");
    }

    const updatedRole = await prisma.role.update({
      where: { roleId },
      data: { roleName }
    });

    await safeAudit({
      action: "ROLE_UPDATE",
      entity: "Role",
      entityKey: `Role:${roleId}`,
      oldValue: oldRole,
      newValue: updatedRole,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Role updated.', role: updatedRole });
  } catch (error) { next(error); }
};

const deleteRole = async (req, res, next) => {
  try {
    const performedByEmployeeId = Number(req.user.employeeId);
    const roleId = parseInt(req.params.roleId);

    const oldRole = await prisma.role.findUnique({ where: { roleId } });
    if (!oldRole) throw CustomError.notFound("Role not found.");

    if (['Admin', 'HR', 'Worker'].includes(oldRole.roleName)) {
      throw CustomError.forbidden("Cannot delete system default roles.");
    }

    // Check usage
    const userCount = await prisma.employee.count({ where: { roleId } });
    if (userCount > 0) {
      throw CustomError.conflict(`Cannot delete role. It is assigned to ${userCount} employees.`);
    }

    await prisma.role.delete({ where: { roleId } });

    await safeAudit({
      action: "ROLE_DELETE",
      entity: "Role",
      entityKey: `Role:${roleId}`,
      oldValue: oldRole,
      newValue: null,
      performedByEmployeeId,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Role deleted successfully.' });
  } catch (error) { next(error); }
};

module.exports = {
  getAllEmployees, getEmployeeQuota, updateEmployeeQuotaBulk,
  getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  getQuotas, createQuota, updateQuota,
  getHolidays, createHoliday, deleteHoliday,
  syncAllEmployeesQuota, processYearEndCarryForward, createEmployee, updateEmployeeByAdmin,
  getAttendancePolicy, updateAttendancePolicy,
  getRoles, createRole, updateRole, deleteRole
};
