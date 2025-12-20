const prisma = require('../models/prisma');
const CustomError = require('../utils/customError'); // ถ้า Boss ไม่มีไฟล์นี้ ให้เปลี่ยนเป็น throw new Error(...) แทนได้ครับ

// 1. ดึงการแจ้งเตือนของฉัน
exports.getMyNotifications = async (req, res, next) => {
    try {
        // ดึง employeeId จาก Token (ผ่าน Middleware Auth)
        const myId = req.user.employeeId; 

        const notifications = await prisma.notification.findMany({
            where: { employeeId: myId },
            orderBy: { createdAt: 'desc' }, // เอาอันใหม่สุดขึ้นก่อน
            take: 50, // ดึงมาสูงสุด 50 อัน (กันหน้าเว็บอืด)
            include: {
                // Join ไปเอาข้อมูลใบลามาด้วย (ถ้ามี) เผื่อจะแสดงรายละเอียดเพิ่ม
                relatedRequest: {
                    select: { status: true, startDate: true, endDate: true, leaveType: true }
                }
            }
        });

        // นับจำนวนที่ยังไม่อ่าน
        const unreadCount = await prisma.notification.count({
            where: { 
                employeeId: myId,
                isRead: false 
            }
        });

        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        next(error);
    }
};

// 2. กดอ่าน (Mark as Read)
exports.markAsRead = async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id);
        const myId = req.user.employeeId;

        // เช็คก่อนว่าเป็นของคนนี้จริงๆ ไหม (Security)
        const noti = await prisma.notification.findUnique({
            where: { notificationId: targetId }
        });

        if (!noti) throw CustomError.notFound('Notification not found');
        
        // ป้องกันไม่ให้ไปกดอ่านของคนอื่น
        if (noti.employeeId !== myId) throw CustomError.forbidden('Not your notification');

        // อัปเดตสถานะเป็น "อ่านแล้ว"
        await prisma.notification.update({
            where: { notificationId: targetId },
            data: { isRead: true }
        });

        res.json({ success: true, message: 'Marked as read' });
    } catch (error) {
        next(error);
    }
};

// 3. ลบแจ้งเตือนทั้งหมด (Clear All)
exports.clearAll = async (req, res, next) => {
    try {
        const myId = req.user.employeeId;
        
        // ลบเฉพาะของตัวเองเท่านั้น
        await prisma.notification.deleteMany({
            where: { employeeId: myId }
        });
        
        res.json({ success: true, message: 'All notifications cleared' });
    } catch (error) {
        next(error);
    }
};

// 4. ลบแจ้งเตือนแบบเลือก
exports.deleteNoti = async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id);
        const myId = req.user.employeeId;

        // ลบโดยเช็คเงื่อนไข employeeId เพื่อความปลอดภัย (ลบได้เฉพาะของตัวเอง)
        const result = await prisma.notification.deleteMany({
            where: {
                notificationId: targetId,
                employeeId: myId
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบการแจ้งเตือน หรือไม่มีสิทธิ์ลบ" });
        }

        res.json({ success: true, message: 'ลบการแจ้งเตือนสำเร็จ' });
    } catch (error) {
        next(error);
    }
};