// backend/src/routes/timeRecord.route.js

const express = require('express');
const { query } = require('express-validator');
const timeRecordController = require('../controllers/timeRecord.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const router = express.Router();

router.use(authenticateToken); 

// POST /api/timerecord/checkin
router.post('/checkin', authorizeRole(['Worker', 'HR']), timeRecordController.handleCheckIn);

// POST /api/timerecord/checkout
router.post('/checkout', authorizeRole(['Worker', 'HR']), timeRecordController.handleCheckOut);

// GET /api/timerecord/late/summary (Worker/HR sees late status for the month)
router.get('/late/summary', authorizeRole(['Worker', 'HR']), timeRecordController.getMonthlyLateSummary);

// GET /api/timerecord/my - ดูประวัติลงเวลาของตัวเอง
router.get(
    '/my',
    authorizeRole(['Worker', 'HR']),
    [
        query('startDate').optional().isISO8601().toDate().withMessage('Start date must be YYYY-MM-DD.'),
        query('endDate').optional().isISO8601().toDate().withMessage('End date must be YYYY-MM-DD.'),
        validate
    ],
    timeRecordController.getMyTimeRecords
);

// GET /api/timerecord/all - ดูประวัติลงเวลาของทุกคน (สำหรับ HR)
router.get(
    '/all',
    authorizeRole(['HR']),
    [
        query('startDate').optional().isISO8601().toDate().withMessage('Start date must be YYYY-MM-DD.'),
        query('endDate').optional().isISO8601().toDate().withMessage('End date must be YYYY-MM-DD.'),
        query('employeeId').optional().isInt().withMessage('Employee ID must be an integer.'),
        validate
    ],
    timeRecordController.getAllTimeRecords
);

module.exports = router;