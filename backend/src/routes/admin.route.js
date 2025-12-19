// backend/src/routes/admin.route.js

const express = require('express');
const { body, param } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const router = express.Router();

router.use(authenticateToken);

// --- 🔓 1. พนักงานทั่วไป และ HR สามารถเข้าถึงได้ ---
router.get('/leavetype', authorizeRole(['HR', 'Worker']), adminController.getLeaveTypes);
router.get('/holiday', authorizeRole(['HR', 'Worker']), adminController.getHolidays);

// สำหรับ Frontend Employees.js: เรียก /api/hr/leave-types
router.get('/hr/leave-types', authorizeRole(['HR', 'Worker']), adminController.getLeaveTypes);

// --- 🔒 2. เฉพาะ HR เท่านั้น ---
router.use(authorizeRole(['HR'])); 

// Employee Management (NEW)
router.get('/employees', adminController.getAllEmployees); // สำหรับเรียกรายชื่อพนักงาน

// Quota Management per Employee (NEW - สำหรับ Modal ในหน้า Employees.js)
router.get('/hr/leave-quota/:employeeId', [ param('employeeId').isInt(), validate ], adminController.getEmployeeQuota);
router.put('/hr/leave-quota/:employeeId', [ param('employeeId').isInt(), body('quotas').isArray(), validate ], adminController.updateEmployeeQuotaBulk);

// Leave Type Management (Write actions)
router.post('/leavetype', [ body('typeName').notEmpty().withMessage('Type Name is required.'), body('isPaid').optional().isBoolean().withMessage('isPaid must be a boolean.'), validate ], adminController.createLeaveType);
router.put('/leavetype/:leaveTypeId', [ param('leaveTypeId').isInt(), body('typeName').notEmpty(), body('isPaid').optional().isBoolean(), validate ], adminController.updateLeaveType);
router.delete('/leavetype/:leaveTypeId', [ param('leaveTypeId').isInt(), validate ], adminController.deleteLeaveType);

// Leave Quota Management (CRUD เดิม)
router.get('/quota', adminController.getQuotas);
router.post('/quota', [ body('employeeId').isInt(), body('leaveTypeId').isInt(), body('year').isInt({ min: 2020 }), body('totalDays').isFloat({ min: 0 }), validate ], adminController.createQuota);
router.put('/quota/:quotaId', [ param('quotaId').isInt(), body('totalDays').isFloat({ min: 0 }), validate ], adminController.updateQuota);

// Holiday Management (Write actions)
router.post('/holiday', [ body('holidayDate').isISO8601().toDate(), body('holidayName').notEmpty(), validate ], adminController.createHoliday);
router.delete('/holiday/:holidayId', [ param('holidayId').isInt(), validate ], adminController.deleteHoliday);

module.exports = router;