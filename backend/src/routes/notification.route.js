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

// 2. PUT: กดอ่านแจ้งเตือน
router.put('/:id/read', notificationController.markAsRead);

// 3. DELETE: ลบแจ้งเตือนทั้งหมด (ใช้ /clear-all เพื่อให้สื่อความหมายชัดเจน)
router.delete('/clear-all', notificationController.clearAll);

// 🆕 4. DELETE: ลบแจ้งเตือนทีละอัน (เพิ่มเข้ามาใหม่เพื่อแก้ 404)
router.delete('/:id', notificationController.deleteNoti);

module.exports = router;