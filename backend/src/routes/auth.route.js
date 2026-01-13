// backend/src/routes/auth.route.js

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validation.middleware');
const authenticateToken = require('../middlewares/auth.middleware');
const { authorizeRole } = require('../middlewares/role.middleware');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/profiles/';
        // ✅ ตรวจสอบว่ามีโฟลเดอร์ไหม ถ้าไม่มีให้สร้าง (recursive: true คือสร้างโฟลเดอร์แม่ด้วยถ้าไม่มี)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // ตั้งชื่อไฟล์: profile-upd-เวลา-เลขสุ่ม.นามสกุล
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-upd-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // จำกัด 5MB เหมือนระบบลา
});

const router = express.Router();

// --- 1. Register Route (สมัครสมาชิก - HR Only) ---
router.post(
    '/register',
    authenticateToken, // ต้อง Login ก่อน
    authorizeRole(['HR']), // ต้องเป็น HR เท่านั้น
    [
        // Validation Checks using express-validator
        body('email').isEmail().withMessage('Invalid email format.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
        body('firstName').notEmpty().withMessage('First name is required.'),
        body('lastName').notEmpty().withMessage('Last name is required.'),
        // joiningDate ต้องเป็น YYYY-MM-DD
        body('joiningDate').isISO8601().toDate().withMessage('Joining date must be a valid date (YYYY-MM-DD).'),
        // Middleware ที่จะโยน Error 422 หาก validation ล้มเหลว
        validate
    ],
    authController.register
);

// --- 2. Login Route (เข้าสู่ระบบ) ---
router.post(
    '/login',
    [
        // Validation Checks
        body('email').isEmail().withMessage('Invalid email format.'),
        body('password').notEmpty().withMessage('Password is required.'),
        validate
    ],
    authController.login
);

router.get('/me', authenticateToken, authController.getMe);
router.put('/update-profile', authenticateToken, authController.updateProfile);

router.post(
    '/request-profile-update',
    authenticateToken,
    upload.single('attachment'), // คีย์ไฟล์ชื่อ 'attachment'
    authController.requestProfileUpdate
);

// สำหรับดึงรายการทั้งหมดไปโชว์ในตาราง
router.get('/admin/profile-requests', authenticateToken, authorizeRole(['HR']), authController.getAllProfileRequests);

// สำหรับกด Approve/Reject
router.put('/admin/profile-approval/:requestId', authenticateToken, authorizeRole(['HR']), authController.handleProfileApproval);

module.exports = router;