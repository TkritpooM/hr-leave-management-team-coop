const prisma = require('../models/prisma');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');
// 🔥 ปรับ Import: เอา isLateCheckIn ออก และนำ checkIsLate เข้ามาแทน
const { getCurrentTimeInTimezone, formatDateOnly, checkIsLate, TIMEZONE } = require('../utils/time.utils');

/**
 * Handles the employee's check-in operation.
 */
const checkIn = async (employeeId) => {
    const nowMoment = getCurrentTimeInTimezone();
    const now = nowMoment.toDate();
    const todayStr = formatDateOnly(now);

    const [existingRecord, policy, leave] = await Promise.all([
        prisma.timeRecord.findUnique({
            where: { employeeId_workDate: { employeeId, workDate: new Date(todayStr) } }
        }),
        prisma.attendancePolicy.findFirst({ where: { policyId: 1 } }),
        prisma.leaveRequest.findFirst({
            where: {
                employeeId,
                status: 'Approved',
                startDate: { lte: new Date(todayStr) },
                endDate: { gte: new Date(todayStr) }
            }
        })
    ]);

    if (existingRecord) throw CustomError.conflict("คุณได้เช็คอินไปแล้วในวันนี้");
    if (!policy) throw CustomError.notFound("ไม่พบการตั้งค่านโยบายการเข้างาน");

    // 🚩 เช็ควันหยุดพิเศษ (ข้อ 5)
    if (policy.specialHolidays?.includes(todayStr)) {
        throw CustomError.badRequest("วันนี้เป็นวันหยุดพิเศษตามนโยบาย ไม่สามารถลงเวลาได้");
    }

    // 🚩 [ปรับปรุง] บล็อกการเช็คอินหลังเวลาเลิกงาน (Prevent Check-in after End Time)
    // ถ้าลาครึ่งบ่าย ให้ใช้เวลาเริ่มพักเป็นเกณฑ์หมดเวลาเช็คอิน ถ้าคนปกติใช้เวลาเลิกงาน
    // 🚩 [1] บล็อกการเช็คอินหลังเวลาเลิกงาน (อันเดิมที่คุณมีอยู่แล้ว)
    const isHalfAfternoon = leave && (leave.startDuration === 'HalfAfternoon' || leave.endDuration === 'HalfAfternoon');
    const deadlineStr = isHalfAfternoon ? policy.breakStartTime : policy.endTime;
    const deadlineMoment = moment.tz(`${todayStr} ${deadlineStr}`, TIMEZONE);

    if (nowMoment.isAfter(deadlineMoment)) {
        const errorMsg = isHalfAfternoon 
            ? `คุณลาครึ่งบ่าย หมดเวลาบันทึกเช็คอินแล้ว (สิ้นสุดกะงานเช้าเวลา ${policy.breakStartTime})`
            : `หมดเวลาบันทึกเวลาทำงานสำหรับวันนี้แล้ว (เลิกงานเวลา ${policy.endTime})`;
        throw CustomError.badRequest(errorMsg);
    }

    // 🚩 [2] เพิ่มใหม่: บล็อกการเช็คอินก่อนเวลาที่กำหนด (เช่น ก่อน 06:00 น.)
    const startTimeMoment = moment.tz(`${todayStr} ${policy.startTime}`, TIMEZONE);
    const earliestAllowed = startTimeMoment.clone().subtract(4, 'hours');

    if (nowMoment.isBefore(earliestAllowed)) {
        throw CustomError.badRequest(`ยังไม่ถึงเวลาเริ่มบันทึกงานสำหรับวันนี้ (เปิดให้บันทึกได้ตั้งแต่เวลา ${earliestAllowed.format('HH:mm')} น.)`);
    }

    let targetInTime = policy.startTime;

    // 🚩 Logic 3.5 & 3.2: เช็คสถานะการลา
    if (leave) {
        // 1. กรณีลาเต็มวัน (3.5)
        if (leave.startDuration === 'Full' || (leave.startDuration === 'HalfMorning' && leave.endDuration === 'HalfAfternoon')) {
            throw CustomError.badRequest("คุณมีการลาเต็มวันที่ได้รับอนุมัติแล้ว ไม่ต้องลงเวลาทำงาน");
        }

        // 2. กรณีลาครึ่งวันเช้า (3.2)
        if (leave.startDuration === 'HalfMorning') {
            const breakStartMoment = moment.tz(`${todayStr} ${policy.breakStartTime}`, TIMEZONE);
            if (nowMoment.isBefore(breakStartMoment)) {
                throw CustomError.badRequest(`คุณลาครึ่งวันเช้า จะเริ่มเช็คอินได้ตั้งแต่เวลาพัก (${policy.breakStartTime}) เป็นต้นไป`);
            }
            // ใช้เวลาจบพักเป็นเกณฑ์เช็คสาย
            targetInTime = policy.breakEndTime;
        }
        
        // 3. กรณีลาครึ่งวันบ่าย (3.3) -> ใช้ targetInTime = policy.startTime ตามปกติ (เพราะต้องมาเช้า)
    }

    // คำนวณสถานะสาย
    const isLate = checkIsLate(now, targetInTime, policy.graceMinutes);

    return await prisma.timeRecord.create({
        data: {
            employeeId,
            workDate: new Date(todayStr),
            checkInTime: now,
            isLate
        }
    });
};

/**
 * Handles the employee's check-out operation. (โค้ดส่วนนี้โอเคแล้วครับ)
 */
const checkOut = async (employeeId) => {
    const nowMoment = getCurrentTimeInTimezone();
    const now = nowMoment.toDate();
    const todayStr = formatDateOnly(now);

    const [existingRecord, policy, leave] = await Promise.all([
        prisma.timeRecord.findUnique({
            where: { employeeId_workDate: { employeeId, workDate: new Date(todayStr) } }
        }),
        prisma.attendancePolicy.findFirst({ where: { policyId: 1 } }),
        prisma.leaveRequest.findFirst({
            where: {
                employeeId,
                status: 'Approved',
                startDate: { lte: new Date(todayStr) },
                endDate: { gte: new Date(todayStr) }
            }
        })
    ]);

    if (!existingRecord) throw CustomError.badRequest("ไม่พบข้อมูลการเช็คอินของวันนี้");
    if (existingRecord.checkOutTime) throw CustomError.badRequest("คุณได้เช็คเอาท์ไปแล้ว");

    // กำหนดเวลาที่สามารถออกได้ (Earliest Exit Time)
    let earliestExitTimeStr = policy.endTime;

    // 🚩 Logic 3.3: ถ้าลาครึ่งบ่าย อนุญาตให้ออกได้ตั้งแต่ Break Start
    if (leave && (leave.endDuration === 'HalfAfternoon' || leave.startDuration === 'HalfAfternoon')) {
        earliestExitTimeStr = policy.breakStartTime;
    }

    const exitDeadline = moment.tz(`${todayStr} ${earliestExitTimeStr}`, TIMEZONE);

    // 🚩 อุดช่องโหว่ 3.3 & 3.4: เช็คว่าออกก่อนเวลาหรือไม่
    if (nowMoment.isBefore(exitDeadline)) {
        const msg = leave && (leave.endDuration === 'HalfAfternoon' || leave.startDuration === 'HalfAfternoon')
            ? `คุณลาครึ่งบ่าย แต่ยังไม่ถึงเวลาเริ่มพัก (${policy.breakStartTime})`
            : `ยังไม่ถึงเวลาเลิกงานตามนโยบาย (${policy.endTime})`; // หากพนักงานปกติ ก็แจ้งตาม Policy
        
        throw CustomError.badRequest(msg);
    }

    return await prisma.timeRecord.update({
        where: { recordId: existingRecord.recordId },
        data: { checkOutTime: now }
    });
};

module.exports = {
    checkIn,
    checkOut,
};