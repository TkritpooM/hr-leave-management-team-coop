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

  // 1) Check previous leave
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
      throw CustomError.badRequest(
        'errors.leave.leaveGapFromPrevious',
        {
          gapDays: gap,
          lastLeaveDate: lastEnd.format('DD MMM')
        }
      );
    }
  }

  // 2) Check upcoming leave
  const nextLeave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: 'Approved',
      startDate: { gt: requestedStart.toDate() }
    },
    orderBy: { startDate: 'asc' }
  });

  if (nextLeave) {
    const nextStart = moment(nextLeave.startDate).startOf('day');
    const diffDays = nextStart.diff(requestedStart, 'days') - 1;
    if (diffDays < gap) {
      throw CustomError.badRequest(
        'errors.leave.leaveGapBeforeNext',
        {
          gapDays: gap,
          nextLeaveDate: nextStart.format('DD MMM')
        }
      );
    }
  }
};

/**
 * Calculates valid working days between dates
 */
const getValidWorkDays = async (startDateStr, endDateStr) => {
  const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
  const end = moment(endDateStr).tz(TIMEZONE).startOf('day');

  const [holidayRecords, policy] = await Promise.all([
    getHolidays(start.toDate(), end.toDate()),
    prisma.attendancePolicy.findFirst({ where: { policyId: 1 } })
  ]);

  const workingDaysArr = policy?.workingDays
    ? parseWorkingDaysToNumbers(policy.workingDays)
    : [1, 2, 3, 4, 5];

  const holidayMap = new Map();
  holidayRecords.forEach(h => holidayMap.set(moment(h.holidayDate).format('YYYY-MM-DD'), true));
  if (policy?.specialHolidays) {
    policy.specialHolidays.forEach(hStr => holidayMap.set(hStr, true));
  }

  let workDaysCount = 0;
  let current = start.clone();
  while (current.isSameOrBefore(end, 'day')) {
    const dateStr = current.format('YYYY-MM-DD');
    const dayOfWeek = current.day();
    const isWorkingDay = workingDaysArr.includes(dayOfWeek);
    const isHoliday = holidayMap.has(dateStr);

    if (isWorkingDay && !isHoliday) {
      workDaysCount++;
    }
    current.add(1, 'day');
  }
  return workDaysCount;
};

const parseWorkingDaysToNumbers = (str) => {
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str.split(',').map(d => dayMap[d.trim().toLowerCase()]).filter(n => n !== undefined);
};

/**
 * Checks for overlapping leave requests
 */
const checkLeaveOverlap = async (employeeId, startDate, endDate) => {
  const overlappingRequest = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ['Pending', 'Approved'] },
      AND: [
        { startDate: { lte: new Date(endDate) } },
        { endDate: { gte: new Date(startDate) } }
      ]
    }
  });

  if (overlappingRequest) {
    throw CustomError.conflict('errors.leave.overlappingRequest');
  }
};

/**
 * Calculates total leave days (supports half-day)
 */
const calculateTotalDays = async (startDateStr, endDateStr, startDuration, endDuration) => {
  const start = moment(startDateStr).tz(TIMEZONE).startOf('day');
  const end = moment(endDateStr).tz(TIMEZONE).startOf('day');

  if (start.isAfter(end)) {
    throw CustomError.badRequest('errors.leave.startAfterEnd');
  }

  let totalDays = await getValidWorkDays(startDateStr, endDateStr);

  if (totalDays === 0) return 0.0;

  if (totalDays === 1) {
    totalDays = (startDuration !== 'Full') ? 0.5 : 1.0;
  } else {
    if (startDuration !== 'Full') {
      if (await getValidWorkDays(startDateStr, startDateStr) === 1) totalDays -= 0.5;
    }
    if (endDuration !== 'Full') {
      if (await getValidWorkDays(endDateStr, endDateStr) === 1) totalDays -= 0.5;
    }
  }

  return parseFloat(Math.max(0, totalDays).toFixed(2));
};

/**
 * Checks quota availability
 */
const checkQuotaAvailability = async (employeeId, leaveTypeId, requestedDays, year) => {
  const quota = await prisma.leaveQuota.findUnique({
    where: {
      employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year }
    }
  });

  if (!quota) {
    throw CustomError.badRequest('errors.leave.quotaNotSet');
  }

  const pendingRequests = await prisma.leaveRequest.aggregate({
    where: {
      employeeId,
      leaveTypeId,
      status: 'Pending',
      startDate: {
        gte: moment().year(year).startOf('year').toDate(),
        lte: moment().year(year).endOf('year').toDate()
      }
    },
    _sum: { totalDaysRequested: true }
  });

  const pendingDays = parseFloat(pendingRequests._sum.totalDaysRequested || 0);
  const approvedUsedDays = parseFloat(quota.usedDays);
  const totalEffectiveQuota = parseFloat(quota.totalDays) + parseFloat(quota.carriedOverDays);
  const available = parseFloat((totalEffectiveQuota - (approvedUsedDays + pendingDays)).toFixed(2));

  if (requestedDays > available) {
    throw CustomError.conflict(
      'errors.leave.insufficientQuota',
      { pendingDays, available, requestedDays }
    );
  }

  return quota;
};

/**
 * Updates used quota
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
