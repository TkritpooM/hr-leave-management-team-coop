// backend/src/routes/admin.route.js

const express = require('express');
const { body, param } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const router = express.Router();

router.use(authenticateToken);

// --- 🔓 1. ย้ายเฉพาะคำสั่ง GET ที่พนักงานต้องใช้ มาไว้ก่อน middleware HR ---
// อนุญาตให้ทั้ง HR และ Worker ดูประเภทการลาและวันหยุดได้
router.get('/leavetype', authorizeRole(['HR', 'Worker']), adminController.getLeaveTypes);
router.get('/holiday', authorizeRole(['HR', 'Worker']), adminController.getHolidays);

// --- 🔒 2. คำสั่งหลังจากนี้ทั้งหมด จะต้องเป็น HR เท่านั้น ---
router.use(authorizeRole(['HR'])); 

// Leave Type Management (Write actions)
router.post('/leavetype', [ body('typeName').notEmpty().withMessage('Type Name is required.'), body('isPaid').optional().isBoolean().withMessage('isPaid must be a boolean.'), validate ], adminController.createLeaveType);
router.put('/leavetype/:leaveTypeId', [ param('leaveTypeId').isInt(), body('typeName').notEmpty(), body('isPaid').optional().isBoolean(), validate ], adminController.updateLeaveType);
router.delete('/leavetype/:leaveTypeId', [ param('leaveTypeId').isInt(), validate ], adminController.deleteLeaveType);

// Leave Quota Management
router.get('/quota', adminController.getQuotas);
router.post('/quota', [ body('employeeId').isInt(), body('leaveTypeId').isInt(), body('year').isInt({ min: 2020 }), body('totalDays').isFloat({ min: 0 }), validate ], adminController.createQuota);
router.put('/quota/:quotaId', [ param('quotaId').isInt(), body('totalDays').isFloat({ min: 0 }), validate ], adminController.updateQuota);

// Holiday Management (Write actions)
router.post('/holiday', [ body('holidayDate').isISO8601().toDate(), body('holidayName').notEmpty(), validate ], adminController.createHoliday);
router.delete('/holiday/:holidayId', [ param('holidayId').isInt(), validate ], adminController.deleteHoliday);

module.exports = router;