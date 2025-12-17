// backend/src/server.js

const dotenv = require('dotenv');
dotenv.config({ path: './.env' }); 

const http = require('http');
const prisma = require('./models/prisma'); 
const notificationService = require('./services/notification.service'); 

// 🔥 แก้ตรงนี้: ให้ชี้ไปที่ไฟล์ config/server.js
const createApp = require('./config/server'); 

const app = createApp();

const PORT = process.env.PORT || 8000;
const server = http.createServer(app);

// Initialize Web Socket
notificationService.initializeWebSocket(server);

// Start Server
server.listen(PORT, async () => {
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully.');
        console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
        console.log(`📡 API Ready at: http://localhost:${PORT}/api/leave`);
    } catch (error) {
        console.error('❌ Failed to connect to database or start server:', error.message);
        process.exit(1);
    }
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err);
    server.close(() => {
        process.exit(1);
    });
});