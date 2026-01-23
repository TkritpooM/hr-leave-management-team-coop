// backend/src/routes/admin.route.js

const express = require('express');
const { body, param } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const departmentController = require('../controllers/department.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole, authorizePermission } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const router = express.Router();

router.use(authenticateToken);

// --- 🔓 1. Shared Resources (Checked by Permissions) ---
// Everyone needs basic access? No, specific permissions.
// If accessing these lists, you probably have a reason (Dashboard, Settings, etc.)
// Helper: Anyone with ANY HR-like permission might need these lists?
// Let's use specific permissions.

router.get('/leavetype', authorizePermission('access_leave_settings'), adminController.getLeaveTypes);
router.get('/holiday', authorizePermission('access_leave_settings'), adminController.getHolidays);

// สำหรับ Frontend Employees.js: เรียก /api/hr/leave-types (Allow employee list viewers too?)
router.get('/hr/leave-types', authorizePermission('access_employee_list'), adminController.getLeaveTypes);

router.get('/attendance-policy', authorizePermission('access_attendance_policy'), adminController.getAttendancePolicy);

// --- 🔒 2. HR & Admin Resources (Permissions) ---

// Department Management (New permission or group under leave settings/employee list?)
// Let's group under 'access_leave_settings' for now as it's structural, or 'access_employee_list' since Depts contain employees.
// Actually, creating departments is administrative. Let's use 'access_leave_settings' or add 'access_company_structure'.
// For now, let's trust 'access_leave_settings' is close enough or 'access_employee_list' for managing structure.
// Let's stick to 'access_leave_settings' for organization structure or just 'Admin'/'HR' roles for now?
// User wants Custom Roles. So permission is better. Let's use 'access_employee_list' for Depts as it relates to employees.
const subStructurePerm = authorizePermission('access_employee_list');

router.get('/departments', subStructurePerm, departmentController.getDepartments);
router.post('/departments', [subStructurePerm, body('deptName').notEmpty(), validate], departmentController.createDepartment);
router.put('/departments/:id', [subStructurePerm, param('id').isInt(), body('deptName').notEmpty(), validate], departmentController.updateDepartment);
router.delete('/departments/:id', [subStructurePerm, param('id').isInt(), validate], departmentController.deleteDepartment);

// Employee Management
const empPerm = authorizePermission('access_employee_list');
router.get('/employees', empPerm, adminController.getAllEmployees);
router.post('/employees', [
    empPerm,
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('joiningDate').isISO8601(),
    body('departmentId').optional({ checkFalsy: true }).isInt(),
    validate
], adminController.createEmployee);
router.put('/employees/:employeeId', [
    empPerm,
    param('employeeId').isInt(),
    body('email').isEmail(),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('departmentId').optional({ checkFalsy: true }).isInt(),
    validate
], adminController.updateEmployeeByAdmin);

// Quota Management per Employee (Requires accessing employee list AND leave settings potentially?)
// Let's use 'access_leave_settings' for managing quotas.
const quotaPerm = authorizePermission('access_leave_settings');
router.post('/hr/sync-quotas', quotaPerm, adminController.syncAllEmployeesQuota);
router.post('/hr/process-carry-forward', quotaPerm, adminController.processYearEndCarryForward);
router.get('/hr/leave-quota/:employeeId', [quotaPerm, param('employeeId').isInt(), validate], adminController.getEmployeeQuota);
router.put('/hr/leave-quota/:employeeId', [quotaPerm, param('employeeId').isInt(), body('quotas').isArray(), validate], adminController.updateEmployeeQuotaBulk);

// Leave Type Management (Write actions)
const settingsPerm = authorizePermission('access_leave_settings');
router.post('/leavetype', [settingsPerm, body('typeName').notEmpty().withMessage('Type Name is required.'), body('isPaid').optional().isBoolean().withMessage('isPaid must be a boolean.'), body('colorCode').optional().isString(), validate], adminController.createLeaveType);
router.put('/leavetype/:leaveTypeId', [settingsPerm, param('leaveTypeId').isInt(), body('typeName').notEmpty(), body('isPaid').optional().isBoolean(), body('colorCode').optional().isString(), validate], adminController.updateLeaveType);
router.delete('/leavetype/:leaveTypeId', [settingsPerm, param('leaveTypeId').isInt(), validate], adminController.deleteLeaveType);

// Leave Quota Management (CRUD เดิม)
router.get('/quota', settingsPerm, adminController.getQuotas);
router.post('/quota', [settingsPerm, body('employeeId').isInt(), body('leaveTypeId').isInt(), body('year').isInt({ min: 2020 }), body('totalDays').isFloat({ min: 0 }), validate], adminController.createQuota);
router.put('/quota/:quotaId', [settingsPerm, param('quotaId').isInt(), body('totalDays').isFloat({ min: 0 }), validate], adminController.updateQuota);

// Holiday Management (Write actions)
router.post('/holiday', [settingsPerm, body('holidayDate').isISO8601().toDate(), body('holidayName').notEmpty(), validate], adminController.createHoliday);
router.delete('/holiday/:holidayId', [settingsPerm, param('holidayId').isInt(), validate], adminController.deleteHoliday);

router.put('/attendance-policy', authorizePermission('access_attendance_policy'), adminController.updateAttendancePolicy);

// --- 🔒 3. Role Management ---
// --- 🔒 3. Role Management ---
const rolePerm = authorizePermission('access_role_management');

// Allow HR (Employee Managers) to VIEW roles list so they can assign roles
router.get('/roles', authorizePermission(['access_role_management', 'access_employee_list']), adminController.getRoles);
router.get('/permissions', rolePerm, adminController.getPermissions);
router.post('/roles', [rolePerm, body('roleName').notEmpty(), validate], adminController.createRole);
router.put('/roles/:roleId', [rolePerm, param('roleId').isInt(), body('roleName').notEmpty(), validate], adminController.updateRole);
router.delete('/roles/:roleId', [rolePerm, param('roleId').isInt(), validate], adminController.deleteRole);

module.exports = router;