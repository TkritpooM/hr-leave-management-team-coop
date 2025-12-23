// backend/src/routes/leaveRequest.route.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const leaveController = require('../controllers/leave.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

// ตั้งค่าการเก็บไฟล์
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // ระบุโฟลเดอร์
    },
    filename: function (req, file, cb) {
        // ตั้งชื่อไฟล์ใหม่: IDพนักงาน-เวลา-นามสกุลไฟล์เดิม
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'leave-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    // 🔥 เพิ่มส่วนการตรวจสอบไฟล์ตรงนี้
    fileFilter: function (req, file, cb) {
        // กำหนดนามสกุลไฟล์ที่อนุญาต (เพิ่ม pdf, doc, docx ตามต้องการ)
        // กำหนดไฟล์ที่อนุญาต:
        // jpeg/jpg/png -> รูปถ่ายหลักฐาน/ใบรับรองแพทย์จากมือถือ
        // pdf          -> เอกสารทางการ/e-Certificate (ป้องกันการแก้ไข)
        // doc/docx     -> บันทึกข้อความชี้แจงเพิ่มเติม
        // zip          -> กรณีมีหลักฐานหลายไฟล์รวมกัน
        const filetypes = /jpeg|jpg|png|pdf|doc|docx|zip/;
        
        // 1. ตรวจสอบนามสกุลไฟล์จากชื่อไฟล์เดิม
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        // 2. ตรวจสอบ Mimetype ของไฟล์
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            // ส่ง Error กลับไปถ้าไฟล์ไม่ตรงตามเงื่อนไข
            cb(new Error('Error: รองรับเฉพาะไฟล์รูปภาพ (jpg, png) และเอกสาร (pdf, doc, docx) เท่านั้น!'));
        }
    },
    // 🔥 เพิ่มการจำกัดขนาดไฟล์ (เช่น ไม่เกิน 5MB)
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// Helper function สำหรับตรวจสอบว่า Handler เป็น function หรือไม่
function ensureHandler(fn, name) {
    if (typeof fn !== 'function') {
        throw new TypeError(`Route handler "${name}" is not a function. Check controller export.`);
    }
    return fn;
}

// ต้องผ่านการตรวจ Token ก่อน
router.use(authenticateToken);

// --- 🔓 1. Routes สำหรับทุกคน (Worker & HR) - ย้ายพวก "คำเฉพาะ" มาไว้บนสุด ---

// ดึงโควต้าของตัวเอง
router.get('/quota/my', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.getMyQuotas, 'getMyQuotas'));

// 🔥 เพิ่ม Route นี้: ดึงประวัติการลาของตัวเอง (ต้องอยู่ก่อน /:requestId)
router.get('/my', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.getMyRequests, 'getMyRequests'));

// ส่งคำขอลา
router.post('/request', 
    authorizeRole(['Worker', 'HR']), 
    upload.single('attachment'), // คีย์ต้องตรงกับที่ Frontend ส่งมา
    ensureHandler(leaveController.requestLeave, 'requestLeave')
);
router.patch('/:requestId/cancel', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.cancelLeaveRequest, 'cancelLeaveRequest'));

// --- 🔒 2. Routes สำหรับ HR เท่านั้น ---
router.get('/admin/pending', authorizeRole(['HR']), ensureHandler(leaveController.getAllPendingRequests, 'getAllPendingRequests'));
router.get('/admin/all', authorizeRole(['HR']), ensureHandler(leaveController.getAllLeaveRequests, 'getAllLeaveRequests'));
router.put('/admin/approval/:requestId', authorizeRole(['HR']), ensureHandler(leaveController.handleApproval, 'handleApproval'));

// --- 🆔 3. Routes ที่มี Parameter (:requestId) - ต้องอยู่ล่างสุด ---
router.get('/:requestId', authorizeRole(['Worker', 'HR']), ensureHandler(leaveController.getRequestDetail, 'getRequestDetail'));

// (Optional) Shared/Other
router.get('/', authorizeRole(['HR']), ensureHandler(leaveController.getAllRequests, 'getAllRequests'));
router.get('/detail/:id', ensureHandler(leaveController.getLeaveById, 'getLeaveById'));

module.exports = router;