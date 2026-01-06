const prisma = require('../models/prisma');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');
// 🔥 ปรับ Import: เอา isLateCheckIn ออก และนำ checkIsLate เข้ามาแทน
const { getCurrentTimeInTimezone, formatDateOnly, checkIsLate } = require('../utils/time.utils');

/**
 * Handles the employee's check-in operation.
 */
const checkIn = async (employeeId) => {
    const now = getCurrentTimeInTimezone().toDate();
    const todayDateOnly = formatDateOnly(now);

    // 1. ตรวจสอบว่าเช็คอินไปหรือยัง
    const existingRecord = await prisma.timeRecord.findUnique({
        where: {
            employeeId_workDate: {
                employeeId: employeeId,
                workDate: new Date(todayDateOnly), 
            },
        },
    });

    if (existingRecord) {
        throw CustomError.conflict(`Employee ID ${employeeId} has already checked in today.`);
    }

    // 2. ดึงนโยบายการเข้างานจากฐานข้อมูล
    let policy = await prisma.attendancePolicy.findFirst({
        where: { policyId: 1 }
    });

    // ถ้าไม่มีนโยบายใน DB ให้ใช้ค่า Default (กันพัง)
    if (!policy) {
        policy = { startTime: "09:00", graceMinutes: 5 };
    }

    // ⚡ 3. คำนวณสถานะการมาสายโดยเรียกใช้ Utility (สะอาดกว่าเขียนเอง)
    const lateStatus = checkIsLate(now, policy);

    // 4. บันทึกลงฐานข้อมูล
    const newRecord = await prisma.timeRecord.create({
        data: {
            employeeId: employeeId,
            workDate: new Date(todayDateOnly), 
            checkInTime: now,
            isLate: lateStatus,
        },
    });

    return newRecord;
};

/**
 * Handles the employee's check-out operation. (โค้ดส่วนนี้โอเคแล้วครับ)
 */
const checkOut = async (employeeId) => {
    const now = getCurrentTimeInTimezone().toDate();
    const todayDateOnly = formatDateOnly(now);

    // 1. ดึงข้อมูล Record ของวันนี้ และ Policy จาก DB พร้อมกันเพื่อความรวดเร็ว
    const [existingRecord, policy] = await Promise.all([
        prisma.timeRecord.findUnique({
            where: {
                employeeId_workDate: {
                    employeeId: employeeId,
                    workDate: new Date(todayDateOnly),
                },
            },
        }),
        prisma.attendancePolicy.findFirst({
            where: { policyId: 1 } // ดึงนโยบายหลักอันเดียว
        })
    ]);

    // 2. ตรวจสอบเบื้องต้น: ต้องเช็คอินแล้ว และยังไม่ได้เช็คเอาท์
    if (!existingRecord || existingRecord.checkOutTime) {
        throw CustomError.badRequest(existingRecord ? "Employee has already checked out for today." : "Cannot check out: Employee has not checked in yet.");
    }

    // 3. 🔥 ตรวจสอบเวลาเลิกงานตามนโยบาย (Policy Check)
    if (policy && policy.endTime) {
        const [endHour, endMin] = policy.endTime.split(':').map(Number);
        
        // สร้างเวลา Deadline (เลิกงาน) ของวันนี้
        const endDeadline = moment(now).tz("Asia/Bangkok")
            .hour(endHour)
            .minute(endMin)
            .second(0)
            .millisecond(0);

        // ถ้าเวลาปัจจุบัน "ก่อน" เวลาเลิกงาน ให้ Error
        if (moment(now).isBefore(endDeadline)) {
            throw CustomError.badRequest(`It is not yet the scheduled end-of-work time according to the policy. (Policy: ${policy.endTime})`);
        }
    }
    
    // 4. ตรวจสอบความสมเหตุสมผล: เวลาออกต้องไม่ก่อนเวลาเข้า (เผื่อกรณีเซิร์ฟเวอร์เวลาเพี้ยน)
    if (moment(now).isBefore(existingRecord.checkInTime)) {
        throw CustomError.badRequest("Check-out time cannot be earlier than check-in time.");
    }

    // 5. บันทึกเวลาลงฐานข้อมูล
    const updatedRecord = await prisma.timeRecord.update({
        where: { recordId: existingRecord.recordId },
        data: { checkOutTime: now },
    });

    return updatedRecord;
};

module.exports = {
    checkIn,
    checkOut,
};