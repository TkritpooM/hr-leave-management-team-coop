const express = require('express');
const router = express.Router();
const timeRecordController = require('../controllers/timeRecord.controller');
const authenticateToken = require('../middlewares/auth.middleware');

// Routes เดิม
router.post('/check-in', authenticateToken, timeRecordController.handleCheckIn);
router.post('/check-out', authenticateToken, timeRecordController.handleCheckOut);
router.get('/my', authenticateToken, timeRecordController.getMyTimeRecords);
router.get('/all', authenticateToken, timeRecordController.getAllTimeRecords);
router.get('/stats/summary', authenticateToken, timeRecordController.getMonthlyLateSummary);

// Routes ใหม่ (กราฟ + Export)
router.get('/late/summary', authenticateToken, timeRecordController.getMonthlyLateSummary);
router.get('/stats/late-monthly', authenticateToken, timeRecordController.getMonthlyLateStats);
router.get('/export', authenticateToken, timeRecordController.exportAttendanceCSV);

// Ranking Late
router.get('/stats/late-top', authenticateToken, timeRecordController.getTopLateEmployees);

// Daily Details Functions
router.get('/daily-detail', authenticateToken, timeRecordController.getDailyDetail);
router.get('/history/:employeeId', authenticateToken, timeRecordController.getEmployeeAttendanceHistory);

// Monthly select Reports
router.get('/report/performance', authenticateToken, timeRecordController.getEmployeePerformanceReport);

module.exports = router;