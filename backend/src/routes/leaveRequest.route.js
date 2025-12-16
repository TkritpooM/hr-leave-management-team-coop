// backend/src/routes/leaveRequest.route.js

const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leave.controller');

// --- 1. ต้อง Import Middleware เหล่านี้เข้ามาใช้งาน ---
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// Debug: แสดง key ที่ controller ส่งออกมา
console.log('leaveController keys:', Object.keys(leaveController || {}));

// Helper function สำหรับตรวจสอบว่า Handler เป็น function หรือไม่
function ensureHandler(fn, name) {
    if (typeof fn !== 'function') {
        throw new TypeError(`Route handler "${name}" is not a function. Check controller export.`);
    }
    return fn;
}

// --- 2. ต้องผ่านการตรวจ Token ก่อน (Middleware ลำดับแรก) ---
router.use(authenticateToken);

// --- 3. การกำหนด Routes ---

// ดึงโควต้าของตัวเอง (ต้องอยู่บนสุดเพื่อไม่ให้ติดปัญหาเรื่องลำดับ Route)
router.get('/quota/my', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.getMyQuotas, 'getMyQuotas'));

// จัดการคำขอลาทั่วไป (สำหรับ HR หรือตามสิทธิ์)
router.get('/', authorizeRole(['HR']), ensureHandler(leaveController.getAllRequests, 'getAllRequests'));
router.post('/request', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.requestLeave, 'requestLeave'));

// รายการคำขอที่รอการอนุมัติ (สำหรับ HR)
router.get('/admin/pending', authorizeRole(['HR']), ensureHandler(leaveController.getAllPendingRequests, 'getAllPendingRequests'));
router.get('/admin/all', authorizeRole(['HR']), ensureHandler(leaveController.getAllLeaveRequests, 'getAllLeaveRequests'));

// จัดการสถานะการลารายรายการ
router.get('/:requestId', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.getRequestDetail, 'getRequestDetail'));
router.put('/admin/approval/:requestId', authorizeRole(['HR']), ensureHandler(leaveController.handleApproval, 'handleApproval'));

// (Optional) Routes อื่นๆ ถ้ายังจำเป็นต้องใช้
router.get('/detail/:id', ensureHandler(leaveController.getLeaveById, 'getLeaveById'));
router.put('/:id', ensureHandler(leaveController.updateLeaveRequest, 'updateLeaveRequest'));
router.delete('/:id', ensureHandler(leaveController.deleteLeaveRequest, 'deleteLeaveRequest'));

module.exports = router;