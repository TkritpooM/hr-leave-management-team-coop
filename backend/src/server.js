// backend/src/server.js

const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const http = require('http');
const prisma = require('./models/prisma');
const notificationService = require('./services/notification.service');
const { startAuditLogCleanupJob } = require('./jobs/cleanupAuditLogs');

// 🔥 แก้ตรงนี้: ให้ชี้ไปที่ไฟล์ config/server.js
const createApp = require('./config/server');

const app = createApp();

const PORT = process.env.PORT || 8000;

let serverInstance;

const startServer = async () => {
    try {
        // Connect to Database
        await prisma.$connect();
        console.log('✅ Connected to Database');

        // Start Background Jobs
        startAuditLogCleanupJob();

        // Start Server
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
            console.log(`📡 API Ready at: http://localhost:${PORT}/api/leave`);
        });

        // Initialize Web Socket
        notificationService.initializeWebSocket(server);

        return server;
    } catch (error) {
        console.error('❌ Failed to connect to database or start server:', error.message);
        process.exit(1);
    }
};

startServer().then(server => {
    serverInstance = server;
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err);
    if (serverInstance) {
        serverInstance.close(() => {
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
});