// backend/src/services/notification.service.js

const WebSocket = require('ws');

let wss; // Web Socket Server instance
// ใช้ Map เพื่อเก็บการเชื่อมต่อที่ Active โดยใช้ employeeId เป็น Key
const clients = new Map(); 

/**
 * Initializes the WebSocket server and binds it to the HTTP server.
 * @param {object} server - The HTTP server instance from Node.js 'http' module.
 */
const initializeWebSocket = (server) => {
    // สร้าง WebSocket Server โดยใช้ HTTP Server เดียวกัน และกำหนด Path เฉพาะ
    wss = new WebSocket.Server({ server, path: '/ws/notifications' });

    wss.on('connection', (ws) => {
        // console.log('A client connected via WebSocket.');
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                // ข้อความแรกจาก Client ต้องเป็น REGISTRY เพื่อระบุ employeeId
                if (data.type === 'REGISTER' && data.employeeId) {
                    const employeeId = parseInt(data.employeeId);
                    clients.set(employeeId, ws);
                    // console.log(`Employee ${employeeId} registered for WS notifications.`);
                    ws.send(JSON.stringify({ type: 'STATUS', message: 'Successfully registered for real-time notifications.', connected: true }));
                }
            } catch (error) {
                console.error('Error processing WS message:', error.message);
            }
        });

        ws.on('close', () => {
            // ลบ client ที่ Disconnected ออกจาก Map
            clients.forEach((client, employeeId) => {
                if (client === ws) {
                    clients.delete(employeeId);
                    // console.log(`Employee ${employeeId} disconnected.`);
                }
            });
        });
    });

    console.log('Notification WebSocket Server initialized.');
};

/**
 * Sends a real-time notification to a specific employee ID.
 * @param {number} employeeId - The ID of the employee to notify.
 * @param {object} notificationPayload - The notification data payload.
 */
const sendNotification = (employeeId, notificationPayload) => {
    const ws = clients.get(employeeId);

    if (ws && ws.readyState === WebSocket.OPEN) {
        // Payload ต้องมีข้อมูลที่จำเป็นและตรงตาม format ที่ Frontend คาดหวัง
        const payload = JSON.stringify({ 
            type: 'NOTIFICATION', 
            data: notificationPayload,
            timestamp: new Date().toISOString()
        });
        ws.send(payload);
        // ไม่มีการจัดการ Error Handling ของการส่งที่ล้มเหลว ณ ที่นี้
        return true;
    }
    
    return false;
};

module.exports = {
    initializeWebSocket,
    sendNotification,
};