const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authenticateToken = require('../middlewares/auth.middleware');

// บังคับว่าต้อง Login ก่อนถึงจะใช้งาน Route พวกนี้ได้
router.use(authenticateToken);

// 1. GET: ดึงรายการแจ้งเตือนของฉัน
// URL: http://localhost:8000/api/notifications/my
router.get('/my', notificationController.getMyNotifications);

// 2. PUT: กดอ่านแจ้งเตือน (ตาม ID)
// URL: http://localhost:8000/api/notifications/:id/read
router.put('/:id/read', notificationController.markAsRead);

// 3. DELETE: ลบแจ้งเตือนทั้งหมด
// URL: http://localhost:8000/api/notifications/clear
router.delete('/clear', notificationController.clearAll);

module.exports = router;