// backend/src/routes/admin.route.js

const express = require('express');
const { body, param } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const departmentController = require('../controllers/department.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const router = express.Router();

router.use(authenticateToken);

// --- 🔓 1. พนักงานทั่วไป และ HR สามารถเข้าถึงได้ ---
router.get('/leavetype', authorizeRole(['HR', 'Worker', 'Admin']), adminController.getLeaveTypes);
router.get('/holiday', authorizeRole(['HR', 'Worker', 'Admin']), adminController.getHolidays);

// สำหรับ Frontend Employees.js: เรียก /api/hr/leave-types
router.get('/hr/leave-types', authorizeRole(['HR', 'Worker', 'Admin']), adminController.getLeaveTypes);

router.get('/attendance-policy', authorizeRole(['HR', 'Worker', 'Admin']), adminController.getAttendancePolicy);

// --- 🔒 2. HR & Admin Resources (Shared) ---
// Remove global router.use to avoid cascading blocks. We will apply middleware groups.

const hrAdminMw = authorizeRole(['HR', 'Admin']);

// Department Management (NEW)
router.get('/departments', hrAdminMw, departmentController.getDepartments);
router.post('/departments', [hrAdminMw, body('deptName').notEmpty(), validate], departmentController.createDepartment);
router.put('/departments/:id', [hrAdminMw, param('id').isInt(), body('deptName').notEmpty(), validate], departmentController.updateDepartment);
router.delete('/departments/:id', [hrAdminMw, param('id').isInt(), validate], departmentController.deleteDepartment);

// Employee Management (NEW)
router.get('/employees', hrAdminMw, adminController.getAllEmployees); // สำหรับเรียกรายชื่อพนักงาน
router.post('/employees', [
    hrAdminMw,
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('joiningDate').isISO8601(),
    body('departmentId').optional().isInt(),
    validate
], adminController.createEmployee);
router.put('/employees/:employeeId', [
    hrAdminMw,
    param('employeeId').isInt(),
    body('email').isEmail(),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('departmentId').optional({ nullable: true }).isInt(),
    validate
], adminController.updateEmployeeByAdmin);

// Quota Management per Employee (NEW - สำหรับ Modal ในหน้า Employees.js)
router.post('/hr/sync-quotas', hrAdminMw, adminController.syncAllEmployeesQuota);
router.post('/hr/process-carry-forward', authorizeRole(['HR', 'Admin']), adminController.processYearEndCarryForward);
router.get('/hr/leave-quota/:employeeId', [hrAdminMw, param('employeeId').isInt(), validate], adminController.getEmployeeQuota);
router.put('/hr/leave-quota/:employeeId', [hrAdminMw, param('employeeId').isInt(), body('quotas').isArray(), validate], adminController.updateEmployeeQuotaBulk);

// Leave Type Management (Write actions)
router.post('/leavetype', [hrAdminMw, body('typeName').notEmpty().withMessage('Type Name is required.'), body('isPaid').optional().isBoolean().withMessage('isPaid must be a boolean.'), body('colorCode').optional().isString(), validate], adminController.createLeaveType);
router.put('/leavetype/:leaveTypeId', [hrAdminMw, param('leaveTypeId').isInt(), body('typeName').notEmpty(), body('isPaid').optional().isBoolean(), body('colorCode').optional().isString(), validate], adminController.updateLeaveType);
router.delete('/leavetype/:leaveTypeId', [hrAdminMw, param('leaveTypeId').isInt(), validate], adminController.deleteLeaveType);

// Leave Quota Management (CRUD เดิม)
router.get('/quota', hrAdminMw, adminController.getQuotas);
router.post('/quota', [hrAdminMw, body('employeeId').isInt(), body('leaveTypeId').isInt(), body('year').isInt({ min: 2020 }), body('totalDays').isFloat({ min: 0 }), validate], adminController.createQuota);
router.put('/quota/:quotaId', [hrAdminMw, param('quotaId').isInt(), body('totalDays').isFloat({ min: 0 }), validate], adminController.updateQuota);

// Holiday Management (Write actions)
router.post('/holiday', [hrAdminMw, body('holidayDate').isISO8601().toDate(), body('holidayName').notEmpty(), validate], adminController.createHoliday);
router.delete('/holiday/:holidayId', [hrAdminMw, param('holidayId').isInt(), validate], adminController.deleteHoliday);

router.put('/attendance-policy', hrAdminMw, adminController.updateAttendancePolicy);

// --- 🔒 3. เฉพาะ Admin เท่านั้น (Role Management) ---
router.use(authorizeRole(['Admin'])); // Ensure subsequent routes are Admin only
// Note: Middleware stack is sequential, so this appends to previous router.use if not careful.
// To be safe, we will add authorizeRole(['Admin']) explicitly to each route or use a sub-router.
// Given the current structure, adding explicit middleware is safest.

// Role Management
router.get('/roles', authorizeRole(['Admin']), adminController.getRoles);
router.post('/roles', [authorizeRole(['Admin']), body('roleName').notEmpty(), validate], adminController.createRole);
router.put('/roles/:roleId', [authorizeRole(['Admin']), param('roleId').isInt(), body('roleName').notEmpty(), validate], adminController.updateRole);
router.delete('/roles/:roleId', [authorizeRole(['Admin']), param('roleId').isInt(), validate], adminController.deleteRole);

module.exports = router;