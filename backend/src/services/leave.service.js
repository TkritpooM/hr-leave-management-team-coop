// backend/src/services/leave.service.js

const prisma = require('../models/prisma');
const CustomError = require('../utils/customError');
const moment = require('moment-timezone');
const { TIMEZONE } = require('../utils/time.utils');

/**
 * Fetches all holidays from the database within a date range
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
 * Validates the Leave Gap Policy (Minimum days between leaves)
 */
const checkLeaveGapPolicy = async (employeeId, startDate) => {
    const policy = await prisma.attendancePolicy.findFirst({ where: { policyId: 1 } });
    if (!policy || policy.leaveGapDays <= 0) return;

    const gap = policy.leaveGapDays;
    const requestedStart = moment(startDate).startOf('day');

    // 1. ตรวจสอบย้อนหลัง (เหมือนเดิม)
    const lastLeave = await prisma.leaveRequest.findFirst({
        where: {
            employeeId,
            status: 'Approved',
            endDate: { lt: requestedStart.toDate() }
        },
        orderBy: { endDate: 'desc' }
    });

    if (lastLeave) {
        const lastEnd = moment(lastLeave.endDate).startOf('day');
        const diffDays = requestedStart.diff(lastEnd, 'days') - 1;
        if (diffDays < gap) {
            throw CustomError.badRequest(`Policy requires a ${gap}-day gap from your previous leave on ${lastEnd.format('DD MMM')}.`);
        }
    }

    // 2. ตรวจสอบไปข้างหน้า (เพิ่มส่วนนี้)
    const nextLeave = await prisma.leaveRequest.findFirst({
        where: {
            employeeId,
            status: 'Approved',
            startDate: { gt: requestedStart.toDate() } // หาการลาที่เริ่มหลังจากวันที่เราจะลา
        },
        orderBy: { startDate: 'asc' } // เอาอันที่ใกล้ที่สุด
    });

    if (nextLeave) {
        const nextStart = moment(nextLeave.startDate).startOf('day');
        const diffDays = nextStart.diff(requestedStart, 'days') - 1;
        if (diffDays < gap) {
            throw CustomError.badRequest(`Policy requires a ${gap}-day gap from your upcoming leave on ${nextStart.format('DD MMM')}.`);
        }
    }
};

/**
 * Calculates valid working days between dates, excluding weekends and public holidays
 */
const getValidWorkDays = async (startDateStr, endDateStr) => {
    const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
    const end = moment(endDateStr).tz(TIMEZONE).startOf('day');
    
    // 1. Fetch holidays from the main table and special holidays from Policy
    const [holidayRecords, policy] = await Promise.all([
        getHolidays(start.toDate(), end.toDate()),
        prisma.attendancePolicy.findFirst({ where: { policyId: 1 }, select: { specialHolidays: true } })
    ]);

    const holidayMap = new Map();
    // Map main holiday table
    holidayRecords.forEach(h => holidayMap.set(moment(h.holidayDate).format('YYYY-MM-DD'), true));
    
    // Map Special Holidays from Policy field (if any)
    if (policy?.specialHolidays && Array.isArray(policy.specialHolidays)) {
        policy.specialHolidays.forEach(hStr => holidayMap.set(hStr, true));
    }

    let workDaysCount = 0;
    let current = start.clone();
    while (current.isSameOrBefore(end, 'day')) {
        const dateStr = current.format('YYYY-MM-DD');
        const dayOfWeek = current.day(); 
        // Exclude Sunday (0), Saturday (6), and holidays
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayMap.has(dateStr)) {
            workDaysCount++;
        }
        current.add(1, 'day');
    }
    return workDaysCount;
};

/**
 * Checks for overlapping leave requests
 */
const checkLeaveOverlap = async (employeeId, startDate, endDate) => {
    const overlappingRequest = await prisma.leaveRequest.findFirst({
        where: {
            employeeId: employeeId,
            status: { in: ['Pending', 'Approved'] }, // Only check Pending or Approved requests
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
        throw CustomError.conflict("You already have a leave request during this period (Pending or Approved).");
    }
};

/**
 * Calculates the total number of leave days requested, considering half-day durations
 */
const calculateTotalDays = async (startDateStr, endDateStr, startDuration, endDuration) => {
    const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
    const end = moment(endDateStr).tz(TIMEZONE).startOf('day');

    if (start.isAfter(end)) {
        throw CustomError.badRequest("Start date cannot be after end date.");
    }
    
    // 1. Get total valid work days before applying duration logic
    let totalDays = await getValidWorkDays(startDateStr, endDateStr);

    if (totalDays === 0) {
        return 0.00; 
    }

    // 2. Adjust for Half-day logic
    if (totalDays === 1) {
        // Same-day leave
        totalDays = (startDuration === 'HalfMorning' || startDuration === 'HalfAfternoon') ? 0.5 : 1.0;
    } else if (totalDays > 1) {
        // Multi-day leave: Adjust Start Day and End Day only
        
        // Check Start Day
        if (startDuration === 'HalfMorning' || startDuration === 'HalfAfternoon') {
            const isStartWorkDay = await getValidWorkDays(startDateStr, startDateStr);
            if (isStartWorkDay === 1) {
                 totalDays -= 0.5;
            }
        }
        // Check End Day
        if (endDuration === 'HalfMorning' || endDuration === 'HalfAfternoon') {
            const isEndWorkDay = await getValidWorkDays(endDateStr, endDateStr);
            if (isEndWorkDay === 1) {
                 totalDays -= 0.5;
            }
        }
    }

    if (totalDays < 0) {
        totalDays = 0.00;
    }

    return parseFloat(totalDays.toFixed(2));
};

/**
 * Checks if the employee has enough quota for the leave request
 */
const checkQuotaAvailability = async (employeeId, leaveTypeId, requestedDays, year) => {
    // 1. Check leave type (If unpaid, quota check is not required)
    const leaveType = await prisma.leaveType.findUnique({ where: { leaveTypeId } });

    // 2. Fetch employee quota for the specific year
    const quota = await prisma.leaveQuota.findUnique({
        where: { 
            employeeId_leaveTypeId_year: { 
                employeeId, 
                leaveTypeId, 
                year 
            } 
        }
    });

    if (!quota) throw CustomError.badRequest("Leave quota has not been set for this employee for the current year.");

    // 3. Calculate total "Pending" days within the year
    const pendingRequests = await prisma.leaveRequest.aggregate({
        where: {
            employeeId: employeeId,
            leaveTypeId: leaveTypeId,
            status: 'Pending',
            startDate: {
                gte: moment().year(year).startOf('year').toDate(),
                lte: moment().year(year).endOf('year').toDate()
            }
        },
        _sum: {
            totalDaysRequested: true
        }
    });

    const pendingDays = parseFloat(pendingRequests._sum.totalDaysRequested || 0);
    const approvedUsedDays = parseFloat(quota.usedDays);
    
    // Total effective quota = Current year quota + Carry over from previous year
    const totalEffectiveQuota = parseFloat(quota.totalDays) + parseFloat(quota.carriedOverDays);
    
    // Actual available quota = Total effective - (Used + Pending)
    const available = parseFloat((totalEffectiveQuota - (approvedUsedDays + pendingDays)).toFixed(2));

    if (requestedDays > available) {
        throw CustomError.conflict(
            `Insufficient quota. You have ${pendingDays} days currently pending approval. ` +
            `(Total available including carry-over: ${available} days, requested: ${requestedDays} days)`
        );
    }

    return quota;
};

/**
 * Updates used quota (Used within a transaction during approval)
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
    checkLeaveOverlap,
    calculateTotalDays, 
    checkQuotaAvailability,
    updateUsedQuota,
    checkLeaveGapPolicy,
};