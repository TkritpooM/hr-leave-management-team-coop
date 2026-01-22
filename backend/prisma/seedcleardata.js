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

    // 2.1 Clear all data (optional usage of this script, but let's be safe)
    // If the user wants to clear EVERYTHING:
    // await prisma.employee.deleteMany();
    // await prisma.role.deleteMany();
    // But this script seems specific to "Clear Leave Requests". 
    // Wait, the user asked: "และในไฟล์ seedcleardata.js ทำให้ันสามารถที่จะ clear ข้อมูลทั้งหมดใน table ใน database ให้ด้วย"
    // (And in seedcleardata.js make it able to clear ALL data in tables in the database).

    // So I should upgrade it to clear EVERYTHING.

    await prisma.notification.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.timeRecord.deleteMany();
    await prisma.leaveQuota.deleteMany();
    await prisma.leaveType.deleteMany(); // Might be risky if referenced, but user asked for "ALL"
    await prisma.holiday.deleteMany();
    await prisma.profileUpdateRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.employee.deleteMany(); // Must come before Role
    await prisma.department.deleteMany();
    const deleteRoles = await prisma.role.deleteMany();

    console.log(`✅ All data cleared successfully.`);

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