// backend/src/services/leave.service.js (ปรับปรุง)

// ... (Imports เดิม)
const prisma = require('../models/prisma');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');
const { TIMEZONE } = require('../utils/time.utils');

/**
 * ดึงรายการวันหยุดทั้งหมดจาก DB
 */
const getHolidays = async (startDate, endDate) => {
    return prisma.holiday.findMany({
        where: {
            holidayDate: {
                gte: moment(startDate).startOf('day').toDate(),
                lte: moment(endDate).endOf('day').toDate(),
            },
        },
        select: { holidayDate: true },
    });
};

/**
 * คำนวณจำนวนวันทำงานระหว่าง start/end date โดยตัดวันหยุดสุดสัปดาห์ (ส/อา) และวันหยุดนักขัตฤกษ์ออก
 */
const getValidWorkDays = async (startDateStr, endDateStr) => {
    const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
    const end = moment(endDateStr).tz(TIMEZONE).startOf('day');
    
    // 1. ดึงวันหยุดนักขัตฤกษ์ในช่วงวันที่ร้องขอ
    const holidayRecords = await getHolidays(start.toDate(), end.toDate());
    const holidayMap = new Map();
    holidayRecords.forEach(h => {
        // ใช้ ISO string ของวันที่เพื่อเป็น Key
        holidayMap.set(moment(h.holidayDate).format('YYYY-MM-DD'), true);
    });

    let workDaysCount = 0;
    let current = start.clone();

    while (current.isSameOrBefore(end, 'day')) {
        const dateStr = current.format('YYYY-MM-DD');
        const dayOfWeek = current.day(); // 0 (Sun) to 6 (Sat)
        
        // 2. ตรวจสอบ: ไม่ใช่เสาร์ (6) และไม่ใช่อาทิตย์ (0) และไม่ใช่วันหยุดนักขัตฤกษ์
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayMap.has(dateStr)) {
            workDaysCount++;
        }
        current.add(1, 'day');
    }

    return workDaysCount;
};

/**
 * ตรวจสอบการลาทับซ้อน (Overlap)
 */
const checkLeaveOverlap = async (employeeId, startDate, endDate) => {
    const overlappingRequest = await prisma.leaveRequest.findFirst({
        where: {
            employeeId: employeeId,
            status: { in: ['Pending', 'Approved'] }, // ตรวจสอบเฉพาะรายการที่รออนุมัติหรืออนุมัติแล้ว
            AND: [
                {
                    startDate: { lte: new Date(endDate) }
                },
                {
                    endDate: { gte: new Date(startDate) }
                }
            ]
        }
    });

    if (overlappingRequest) {
        throw CustomError.conflict("คุณมีรายการลาในช่วงเวลาดังกล่าวอยู่แล้ว (Pending หรือ Approved)");
    }
};

/**
 * Calculates the number of leave days requested.
 */
const calculateTotalDays = async (startDateStr, endDateStr, startDuration, endDuration) => {
    const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
    const end = moment(endDateStr).tz(TIMEZONE).startOf('day');

    if (start.isAfter(end)) {
        throw CustomError.badRequest("Start date cannot be after end date.");
    }
    
    // 1. หาจำนวนวันทำงานเต็มๆ ก่อนตัด duration (ไม่นับวันหยุด/เสาร์-อาทิตย์)
    let totalDays = await getValidWorkDays(startDateStr, endDateStr);

    // ถ้าจำนวนวันทำงานเป็น 0 (เช่น ลาวันเสาร์) จะถือว่าเป็นการขอลา 0 วัน
    if (totalDays === 0) {
        return 0.00; 
    }

    // 2. ปรับตาม Duration (Half day logic)
    if (totalDays === 1) {
        // ถ้าเป็นวันเดียว
        totalDays = (startDuration === 'HalfMorning' || startDuration === 'HalfAfternoon') ? 0.5 : 1.0;
    } else if (totalDays > 1) {
        // ถ้าหลายวัน: ปรับแค่ Start Day และ End Day
        
        // Check Start Day
        if (startDuration === 'HalfMorning' || startDuration === 'HalfAfternoon') {
            // ต้องมั่นใจว่า Start Day เป็นวันทำงาน
            if (getValidWorkDays(startDateStr, startDateStr) === 1) {
                 totalDays -= 0.5;
            }
        }
        // Check End Day
        if (endDuration === 'HalfMorning' || endDuration === 'HalfAfternoon') {
            // ต้องมั่นใจว่า End Day เป็นวันทำงาน
            if (getValidWorkDays(endDateStr, endDateStr) === 1) {
                 totalDays -= 0.5;
            }
        }
    }

    // Ensure total days is not negative (should not happen if logic is sound)
    if (totalDays < 0) {
        totalDays = 0.00;
    }

    return parseFloat(totalDays.toFixed(2));
};

const checkQuotaAvailability = async (employeeId, leaveTypeId, requestedDays, year) => {
    // 1. ตรวจสอบประเภทการลา (ถ้าลาไม่รับเงินไม่ต้องเช็คโควต้า)
    const leaveType = await prisma.leaveType.findUnique({ where: { leaveTypeId } });
    if (!leaveType?.isPaid) return true;

    // 2. ดึงโควต้าของพนักงานปีนั้นๆ
    const quota = await prisma.leaveQuota.findUnique({
        where: { 
            employeeId_leaveTypeId_year: { 
                employeeId, 
                leaveTypeId, 
                year 
            } 
        }
    });

    if (!quota) throw CustomError.badRequest("ยังไม่มีการตั้งค่าโควต้าการลาสำหรับพนักงานคนนี้ในปีปัจจุบัน");

    const available = parseFloat((quota.totalDays - quota.usedDays).toFixed(2));
    if (requestedDays > available) {
        throw CustomError.conflict(`โควต้าไม่พอ (คงเหลือ: ${available} วัน, ต้องการใช้: ${requestedDays} วัน)`);
    }
    return quota;
};

/**
 * อัปเดตยอดการใช้โควต้า (สำหรับใช้ใน Transaction ตอนอนุมัติ)
 */
const updateUsedQuota = async (employeeId, leaveTypeId, requestedDays, year, tx) => {
    const quota = await tx.leaveQuota.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } }
    });
    if (!quota) return;
    await tx.leaveQuota.update({
        where: { quotaId: quota.quotaId },
        data: { usedDays: { increment: requestedDays } }
    });
};

module.exports = {
    // ... (ฟังก์ชันเดิมอื่นๆ)
    checkLeaveOverlap,
    calculateTotalDays, 
    checkQuotaAvailability,
    updateUsedQuota
    // export getValidWorkDays/getHolidays ถ้าต้องการใช้ที่อื่น แต่ในที่นี้ export แค่ calculateTotalDays พอ
};