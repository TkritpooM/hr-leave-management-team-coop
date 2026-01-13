// backend/src/config/server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const errorMiddleware = require('../middlewares/error.middleware');

// Routes Import
const authRoute = require('../routes/auth.route');
const adminRoute = require('../routes/admin.route');
const timeRecordRoute = require('../routes/timeRecord.route');
const leaveRequestRoute = require('../routes/leaveRequest.route');
const notificationRoute = require('../routes/notification.route');
const auditRoute = require("../routes/audit.route");


const createApp = () => {
    const app = express();

    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('📁 Created "uploads" folder automatically.');
    }

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // 1. Security & CORS
    app.use(helmet({
        crossOriginResourcePolicy: false, // อนุญาตให้ดึงทรัพยากรข้ามแหล่งที่มา (รูปภาพ/PDF)
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:", process.env.FRONTEND_URL || "http://localhost:5173", "http://localhost:8000"],
                // 🔥 เพิ่มส่วนนี้เพื่อให้ iframe ยอมรับ PDF จาก Backend
                frameSrc: ["'self'", "http://localhost:8000"],
                connectSrc: ["'self'", "http://localhost:8000"],
                objectSrc: ["'self'", "data:", "http://localhost:8000"], // สำหรับ <object> หรือ <embed>
                "frame-ancestors": ["'self'", process.env.FRONTEND_URL || "http://localhost:5173"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));

    // 🔥 แก้จุดสำคัญ: ต้องระบุ URL Frontend ให้ชัดเจน (ห้ามใช้ *)
    app.use(cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:5173', // URL ของ React (มี Fallback)
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    }));

    // 2. Body Parser
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // 3. Health Check
    app.get('/', (req, res) => {
        res.status(200).json({ status: 'ok', message: 'HR/Leave Management API is running.' });
    });

    // 4. API Routes
    app.use('/api/auth', authRoute);
    app.use('/api/admin', adminRoute);
    app.use('/api/timerecord', timeRecordRoute);
    app.use('/api/leave', leaveRequestRoute);
    app.use('/api/notifications', notificationRoute);
    app.use('/uploads', express.static(uploadDir));
    app.use('/api/audit', auditRoute);


    // 5. 404 Handler
    app.use((req, res, next) => {
        const CustomError = require('../utils/customError');
        next(CustomError.notFound(`Cannot find ${req.method} ${req.originalUrl}.`));
    });

    // 6. Error Handler
    app.use(errorMiddleware);

    return app;
};

module.exports = createApp;