// prisma/seed.js หรือไฟล์ล้างข้อมูลที่คุณต้องการ
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearLeaveRequests() {
  console.log('⏳ Starting to clear Leave Request data...');

  try {
    // 1. ต้องลบ Notification ก่อน เพราะ Notification มี relatedRequestId ที่อ้างอิง LeaveRequest
    const deleteNotifications = await prisma.notification.deleteMany({
      where: {
        relatedRequestId: { not: null }
      }
    });
    console.log(`✅ Deleted ${deleteNotifications.count} notifications related to leave requests.`);

    // 2. ลบข้อมูลใน LeaveRequest ทั้งหมด
    const deleteRequests = await prisma.leaveRequest.deleteMany({});
    console.log(`✅ Deleted ${deleteRequests.count} leave requests.`);

    // 3. (Optional) รีเซ็ต usedDays ในตาราง LeaveQuota ให้เป็น 0
    // เพื่อให้โควต้ากลับมาเต็มเหมือนเดิมหลังลบใบลา
    const resetQuotas = await prisma.leaveQuota.updateMany({
      data: {
        usedDays: 0.00
      }
    });
    console.log(`✅ Reset usedDays to 0 for ${resetQuotas.count} quotas.`);

  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearLeaveRequests();