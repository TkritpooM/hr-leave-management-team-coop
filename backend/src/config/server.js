// backend/src/config/server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorMiddleware = require('../middlewares/error.middleware');

// Routes Import
const authRoute = require('../routes/auth.route');
const adminRoute = require('../routes/admin.route');
const timeRecordRoute = require('../routes/timeRecord.route');
const leaveRequestRoute = require('../routes/leaveRequest.route');

const createApp = () => {
    const app = express();

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // 1. Security & CORS
    app.use(helmet()); 
    
    // 🔥 แก้จุดสำคัญ: ต้องระบุ URL Frontend ให้ชัดเจน (ห้ามใช้ *)
    app.use(cors({
        origin: 'http://localhost:5173', // URL ของ React
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
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