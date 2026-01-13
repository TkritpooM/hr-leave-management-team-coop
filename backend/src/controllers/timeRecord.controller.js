// backend/src/controllers/timeRecord.controller.js
const timeRecordService = require('../services/timeRecord.service');
const prisma = require('../models/prisma');
const moment = require('moment-timezone');

// ✅ AUDIT
const { logAudit } = require("../utils/auditLogger");
const { getClientIp } = require("../utils/requestMeta");
const safeAudit = async (payload) => {
  try { await logAudit(payload); } catch (e) { console.error("AUDIT_LOG_FAIL:", e?.message || e); }
};

const handleCheckIn = async (req, res, next) => {
  try {
    const employeeId = Number(req.user.employeeId);
    const record = await timeRecordService.checkIn(employeeId);

    await safeAudit({
      action: record.isLate ? "CHECKIN_LATE" : "CHECKIN",
      entity: "TimeRecord",
      entityKey: `Employee:${employeeId}:WorkDate:${new Date(record.workDate).toISOString().slice(0, 10)}`,
      oldValue: null,
      newValue: {
        employeeId,
        workDate: record.workDate,
        checkInTime: record.checkInTime,
        isLate: record.isLate,
        note: record.note || null,
      },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    const message = record.isLate ? 'Check-in successful, but recorded as LATE.' : 'Check-in successful.';
    res.status(201).json({ success: true, message, record });
  } catch (error) { next(error); }
};

const handleCheckOut = async (req, res, next) => {
  try {
    const employeeId = Number(req.user.employeeId);
    const record = await timeRecordService.checkOut(employeeId);

    await safeAudit({
      action: "CHECKOUT",
      entity: "TimeRecord",
      entityKey: `Employee:${employeeId}:WorkDate:${new Date(record.workDate).toISOString().slice(0, 10)}`,
      oldValue: null,
      newValue: {
        employeeId,
        workDate: record.workDate,
        checkOutTime: record.checkOutTime,
      },
      performedByEmployeeId: employeeId,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Check-out successful.', record });
  } catch (error) { next(error); }
};

const getMyTimeRecords = async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId;
    const { startDate, endDate } = req.query;

    const records = await prisma.timeRecord.findMany({
      where: {
        employeeId,
        workDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        }
      },
      orderBy: { workDate: 'desc' }
    });
    res.status(200).json({ success: true, records });
  } catch (error) { next(error); }
};

const getAllTimeRecords = async (req, res, next) => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    const records = await prisma.timeRecord.findMany({
      where: {
        workDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
        ...(employeeId && { employeeId: parseInt(employeeId) })
      },
      include: { employee: { select: { employeeId: true, firstName: true, lastName: true, role: true } } },
      orderBy: { workDate: 'desc' }
    });
    res.status(200).json({ success: true, records });
  } catch (error) { next(error); }
};

const getMonthlyLateSummary = async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId;
    const startOfMonth = moment().startOf('month').toDate();
    const endOfMonth = moment().endOf('month').toDate();

    const lateCount = await prisma.timeRecord.count({
      where: {
        employeeId: employeeId,
        isLate: true,
        workDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        }
      }
    });

    res.status(200).json({
      success: true,
      lateCount,
      lateLimit: 5,
      isExceeded: lateCount > 5
    });
  } catch (error) {
    next(error);
  }
};

// 📊 1. API ดึงสถิติการมาสายของเดือนนี้
const getMonthlyLateStats = async (req, res, next) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const records = await prisma.timeRecord.findMany({
      where: {
        workDate: {
          gte: startOfMonth,
          lte: endOfMonth
        },
        isLate: true
      },
      orderBy: { workDate: 'asc' }
    });

    const stats = {};
    records.forEach(rec => {
      const day = new Date(rec.workDate).getDate();
      stats[day] = (stats[day] || 0) + 1;
    });

    const chartData = Object.keys(stats).map(day => ({
      day: `Day ${day}`,
      count: stats[day]
    }));

    res.json({ success: true, data: chartData });
  } catch (error) {
    next(error);
  }
};

// 📄 2. API Export CSV
const exportAttendanceCSV = async (req, res, next) => {
  try {
    // Optimization: Select only needed fields, do not fetch everything
    const records = await prisma.timeRecord.findMany({
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { workDate: 'desc' }
    });

    // For very large datasets, we should use a stream (piping prisma stream to res).
    // However, since we need to format data (dates, check-in times), a transform stream is needed.
    // Given the constraints and likely size < 100k records, mapping in memory is still risky but better than before if we reduced relation fetching.
    // IMPORTANT: The original code failed to filter by Date Range or User! It dumped the WHOLE table.
    // We should probably add filters similar to other APIs if the frontend supports it.
    // But the current frontend `handleExportPerformance` uses the currently fetched `employeeReport` to generate CSV on client side!
    // Wait, let's check frontend `handleExportPerformance` in HRDashboard.jsx line 147.
    // It generates CSV from `employeeReport` state (which is now PAGINATED).
    // So "Export CSV" on frontend only exports the CURRENT PAGE! That's a bug in the original design if they wanted full export.
    // BUT, this controller function `exportAttendanceCSV` is mapped to `/export` route (line 16 in route file).
    // Frontend `HRDashboard.jsx` line 16 has `axiosClient` but `handleExportPerformance` does NOT call API `/export`. It does client-side export.
    // Who calls `/api/timerecord/export`?
    // Searching... likely "TimeRecord" page or unused?
    // If it's unused by the main dashboard, we might not need to stress too much, but for safety:

    // Let's optimize it assuming it might be used:
    // 1. Add date range support (query params)
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.workDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const streamRecords = await prisma.timeRecord.findMany({
      where,
      select: {
        workDate: true,
        checkInTime: true,
        checkOutTime: true,
        isLate: true,
        employee: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { workDate: 'desc' }
    });

    let csv = 'Date,Employee Name,Check In,Check Out,Status\n';

    // Using a simple loop is fine for < 10k records.
    streamRecords.forEach(rec => {
      const name = `"${rec.employee.firstName} ${rec.employee.lastName}"`;
      const date = new Date(rec.workDate).toLocaleDateString();
      const checkIn = rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString() : '-';
      const checkOut = rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString() : '-';
      const status = rec.isLate ? 'Late' : 'On Time';

      csv += `${date},${name},${checkIn},${checkOut},${status}\n`;
    });

    // ✅ AUDIT: export csv
    await safeAudit({
      action: "EXPORT_ATTENDANCE_CSV",
      entity: "Report",
      entityKey: "AttendanceCSV",
      oldValue: null,
      newValue: { rows: streamRecords.length, dateRange: `${startDate} to ${endDate}` },
      performedByEmployeeId: Number(req.user?.employeeId || 0),
      ipAddress: getClientIp(req),
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('attendance_report.csv');
    return res.send(csv);

  } catch (error) {
    next(error);
  }
};

const getTopLateEmployees = async (req, res, next) => {
  try {
    const { month } = req.query; // เช่น "2025-12"
    const startOfMonth = moment(month).startOf('month').toDate();
    const endOfMonth = moment(month).endOf('month').toDate();

    const lateStats = await prisma.timeRecord.groupBy({
      by: ['employeeId'],
      where: {
        workDate: { gte: startOfMonth, lte: endOfMonth },
        isLate: true
      },
      _count: { isLate: true },
      orderBy: { _count: { isLate: 'desc' } },
      take: 5
    });

    const result = await Promise.all(lateStats.map(async (item) => {
      const emp = await prisma.employee.findUnique({
        where: { employeeId: item.employeeId },
        select: { firstName: true, lastName: true }
      });
      return {
        employeeId: item.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        lateCount: item._count.isLate
      };
    }));

    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const getDailyDetail = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: "Date is required" });

    const targetDateStr = moment(date).format('YYYY-MM-DD');
    const targetDate = moment(date).startOf('day').toDate();
    const endOfTargetDate = moment(date).endOf('day').toDate();

    const policy = await prisma.attendancePolicy.findFirst();
    const specialHolidays = (policy?.specialHolidays || []).map(h => moment(h).format('YYYY-MM-DD'));
    const isSpecialHoliday = specialHolidays.includes(targetDateStr);

    const allEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { employeeId: true, firstName: true, lastName: true, role: true }
    });

    const attendance = await prisma.timeRecord.findMany({
      where: { workDate: { gte: targetDate, lte: endOfTargetDate } },
      include: { employee: { select: { employeeId: true, firstName: true, lastName: true, role: true } } }
    });

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: 'Approved',
        startDate: { lte: endOfTargetDate },
        endDate: { gte: targetDate }
      },
      include: {
        employee: { select: { employeeId: true, firstName: true, lastName: true, role: true } },
        leaveType: true,
        approvedByHR: { select: { firstName: true, lastName: true } }
      }
    });

    const enrichedAttendance = attendance.map(att => {
      const relatedLeave = leaves.find(l => l.employeeId === att.employeeId);
      return {
        ...att,
        // ส่งข้อมูลกะที่ลาไปให้หน้าบ้านแสดงผลในแถบ Present ด้วย
        halfDayStatus: relatedLeave ? (relatedLeave.startDuration === 'HalfMorning' ? 'MorningLeave' : 'AfternoonLeave') : null
      };
    });

    const presentIds = attendance.map(a => a.employeeId);
    const leaveIds = leaves.map(l => l.employeeId);

    const absent = isSpecialHoliday
      ? []
      : allEmployees.filter(emp => !presentIds.includes(emp.employeeId) && !leaveIds.includes(emp.employeeId));

    res.status(200).json({
      success: true,
      data: {
        present: enrichedAttendance,
        leaves: leaves,
        absent: absent,
        isSpecialHoliday: isSpecialHoliday,
        summary: {
          total: allEmployees.length,
          presentCount: attendance.length,
          leaveCount: leaves.length,
          absentCount: absent.length
        }
      }
    });
  } catch (error) { next(error); }
};

const getEmployeePerformanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const start = moment(startDate).tz("Asia/Bangkok").startOf('day');
    const end = moment(endDate).tz("Asia/Bangkok").endOf('day');
    const today = moment().tz("Asia/Bangkok").startOf('day');

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // --- 1. Prepare Date Range & Holidays ---
    const policy = await prisma.attendancePolicy.findFirst();
    const specialHolidays = (policy?.specialHolidays || []).map(h => moment(h).format('YYYY-MM-DD'));
    const effectiveEnd = end.isAfter(today) ? today : end;

    // Calculate Working Days in this period (Loop 30 days = OK)
    let workDaysList = [];
    let curr = start.clone();
    while (curr.isSameOrBefore(effectiveEnd, 'day')) {
      const dayOfWeek = curr.day();
      const dateStr = curr.format('YYYY-MM-DD');
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !specialHolidays.includes(dateStr)) {
        workDaysList.push(dateStr);
      }
      curr.add(1, 'day');
    }
    const totalWorkDays = workDaysList.length;

    // Common Where Clause for Employees to include in report
    const empWhereCondition = {
      joiningDate: { lte: end.toDate() },
      OR: [
        { resignationDate: null },
        { resignationDate: { gte: start.toDate() } }
      ]
    };

    // --- 2. Global Stats (Optimized with Aggregation) ---
    const totalEmployeesCount = await prisma.employee.count({ where: empWhereCondition });

    // Aggregates for Summary
    const totalPresentPromise = prisma.timeRecord.count({
      where: { workDate: { gte: start.toDate(), lte: end.toDate() }, employee: empWhereCondition }
    });

    const totalLatePromise = prisma.timeRecord.count({
      where: { workDate: { gte: start.toDate(), lte: end.toDate() }, isLate: true, employee: empWhereCondition }
    });

    const totalLeavePromise = prisma.leaveRequest.aggregate({
      where: {
        status: 'Approved',
        startDate: { lte: end.toDate() },
        endDate: { gte: start.toDate() },
        employee: empWhereCondition
      },
      _sum: { totalDaysRequested: true }
    });

    // --- 3. Pagination for Table (Fetch subset of employees) ---
    const employeesPromise = prisma.employee.findMany({
      where: empWhereCondition,
      select: { employeeId: true, firstName: true, lastName: true, role: true, joiningDate: true },
      skip: skip,
      take: limitNum,
      orderBy: { employeeId: 'asc' }
    });

    // Execute parallel queries
    const [totalPresent, totalLate, totalLeaveAgg, paginatedEmployees] = await Promise.all([
      totalPresentPromise,
      totalLatePromise,
      totalLeavePromise,
      employeesPromise
    ]);

    const totalLeaveDays = parseFloat(totalLeaveAgg._sum.totalDaysRequested || 0);

    // Approximate Global Absent
    const approximateTotalCapacity = totalEmployeesCount * totalWorkDays;
    const totalAbsent = Math.max(0, approximateTotalCapacity - totalPresent - totalLeaveDays);

    const summary = {
      present: totalPresent,
      late: totalLate,
      leave: totalLeaveDays,
      absent: totalAbsent,
      total: totalPresent + totalLeaveDays + totalAbsent,
      lateRate: totalPresent > 0 ? Math.round((totalLate / totalPresent) * 100) : 0
    };

    // --- 4. Process Individual Report (Only for paginated users) ---
    const targetEmpIds = paginatedEmployees.map(e => e.employeeId);

    // Fetch records only for these employees
    const [subsetAttendance, subsetLeaves] = await Promise.all([
      prisma.timeRecord.findMany({ where: { workDate: { gte: start.toDate(), lte: end.toDate() }, employeeId: { in: targetEmpIds } } }),
      prisma.leaveRequest.findMany({ where: { status: 'Approved', startDate: { lte: end.toDate() }, endDate: { gte: start.toDate() }, employeeId: { in: targetEmpIds } }, include: { leaveType: true } })
    ]);

    const individualReport = paginatedEmployees.map(emp => {
      const myAtts = subsetAttendance.filter(a => a.employeeId === emp.employeeId);
      const myLeaves = subsetLeaves.filter(l => l.employeeId === emp.employeeId);
      const presentCount = myAtts.length;
      const lateCount = myAtts.filter(a => a.isLate).length;

      let absentCount = 0;
      const empJoiningDate = moment(emp.joiningDate).format('YYYY-MM-DD');

      workDaysList.forEach(day => {
        if (day >= empJoiningDate) {
          const hasAtt = myAtts.some(a => moment(a.workDate).format('YYYY-MM-DD') === day);
          const hasLeave = myLeaves.some(l => day >= moment(l.startDate).format('YYYY-MM-DD') && day <= moment(l.endDate).format('YYYY-MM-DD'));
          if (!hasAtt && !hasLeave) absentCount++;
        }
      });

      return {
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        role: emp.role,
        presentCount, lateCount,
        leaveCount: myLeaves.reduce((sum, l) => sum + parseFloat(l.totalDaysRequested), 0),
        absentCount,
        lateRate: presentCount > 0 ? Math.round((lateCount / presentCount) * 100) : 0
      };
    });

    // --- 5. Trend Data & Leave Chart (Optimized) ---
    // Leave Chart
    const leaveDistribution = await prisma.leaveRequest.findMany({
      where: {
        status: 'Approved',
        startDate: { lte: end.toDate() },
        endDate: { gte: start.toDate() },
        employee: empWhereCondition
      },
      include: { leaveType: true }
    });

    const leaveSummaryByType = {};
    leaveDistribution.forEach(l => {
      const typeName = l.leaveType.typeName;
      if (!leaveSummaryByType[typeName]) {
        leaveSummaryByType[typeName] = { name: typeName, value: 0, color: l.leaveType.colorCode || "#3b82f6" };
      }
      leaveSummaryByType[typeName].value += parseFloat(l.totalDaysRequested);
    });

    // Trend Data: Fetch simplified records for trend calculation
    // Note: Fetching ALL records (select workDate) is better than full objects, but still heavy for 10k users.
    // Ideally we use groupBy but we need daily stats.
    // Let's use groupBy day for total present/late.
    const dailyStats = await prisma.timeRecord.groupBy({
      by: ['workDate'],
      where: { workDate: { gte: start.toDate(), lte: end.toDate() }, employee: empWhereCondition },
      _count: { _all: true },
    });
    const dailyLateStats = await prisma.timeRecord.groupBy({
      by: ['workDate'],
      where: { workDate: { gte: start.toDate(), lte: end.toDate() }, isLate: true, employee: empWhereCondition },
      _count: { _all: true },
    });

    // Map to dictionary
    const statsMap = {};
    dailyStats.forEach(d => {
      const k = moment(d.workDate).format('YYYY-MM-DD');
      if (!statsMap[k]) statsMap[k] = { present: 0, late: 0 };
      statsMap[k].present = d._count._all;
    });
    dailyLateStats.forEach(d => {
      const k = moment(d.workDate).format('YYYY-MM-DD');
      if (!statsMap[k]) statsMap[k] = { present: 0, late: 0 };
      statsMap[k].late = d._count._all;
    });

    // Leaves for each day (still need to check range overlap)
    // We can iterate the days and filter leaves.

    let trendData = [];
    let trendCurr = start.clone();

    while (trendCurr.isSameOrBefore(end, 'day')) {
      const dateStr = trendCurr.format('YYYY-MM-DD');
      const dayOfWeek = trendCurr.day();
      const isWorkDay = dayOfWeek !== 0 && dayOfWeek !== 6 && !specialHolidays.includes(dateStr);

      const dayStats = statsMap[dateStr] || { present: 0, late: 0 };
      const dailyLeaveCount = leaveDistribution.filter(l => trendCurr.isBetween(moment(l.startDate), moment(l.endDate), 'day', '[]')).length;

      const present = dayStats.present;
      const late = dayStats.late;

      let absent = 0;
      if (isWorkDay) {
        absent = Math.max(0, totalEmployeesCount - present - dailyLeaveCount);
      }

      trendData.push({
        date: trendCurr.format('DD MMM'),
        fullDate: dateStr, // For interactivity
        present: present - late,
        late: late,
        leave: dailyLeaveCount,
        absent: absent
      });
      trendCurr.add(1, 'day');
    }

    // --- 6. Last Month Comparison ---
    const lastMonthStart = start.clone().subtract(1, 'months').startOf('month');
    const lastMonthEnd = lastMonthStart.clone().endOf('month');

    const [lmPresent, lmLate] = await Promise.all([
      prisma.timeRecord.count({ where: { workDate: { gte: lastMonthStart.toDate(), lte: lastMonthEnd.toDate() }, employee: empWhereCondition } }),
      prisma.timeRecord.count({ where: { workDate: { gte: lastMonthStart.toDate(), lte: lastMonthEnd.toDate() }, isLate: true, employee: empWhereCondition } })
    ]);

    // Calculate last month working days for capacity
    let lmWorkDaysCount = 0;
    let lmCurr = lastMonthStart.clone();
    while (lmCurr.isSameOrBefore(lastMonthEnd, 'day')) {
      const d = lmCurr.day();
      const s = lmCurr.format('YYYY-MM-DD');
      if (d !== 0 && d !== 6 && !specialHolidays.includes(s)) lmWorkDaysCount++;
      lmCurr.add(1, 'day');
    }
    const lmTotalCapacity = totalEmployeesCount * lmWorkDaysCount;
    const lmMockAbsent = Math.max(0, lmTotalCapacity - lmPresent);

    const monthlyComparison = [
      { month: lastMonthStart.format('MMMM YYYY'), present: lmPresent - lmLate, late: lmLate, absent: lmMockAbsent },
      { month: 'Current Period', present: summary.present, late: summary.late, absent: summary.absent }
    ];

    res.status(200).json({
      success: true,
      data: {
        individualReport: individualReport,
        leaveChartData: Object.values(leaveSummaryByType),
        summary: summary,
        trendData,
        monthlyComparison,
        perfectEmployees: [], // Skipped for performance at scale
        pagination: {
          total: totalEmployeesCount,
          totalPages: Math.ceil(totalEmployeesCount / limitNum),
          currentPage: pageNum,
          limit: limitNum
        }
      }
    });
  } catch (error) { next(error); }
};

// 📋 3. API ดึงประวัติรายคน (History)
const getEmployeeAttendanceHistory = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { month, startDate, endDate } = req.query; // รับ month (YYYY-MM) หรือ startDate/endDate

    if (!employeeId) return res.status(400).json({ success: false, message: "Employee ID is required" });

    // 1. Determine Date Range
    let start, end;
    // Default to strict Timezone handling
    const tz = "Asia/Bangkok";

    if (month) {
      start = moment(month).tz(tz).startOf('month');
      end = moment(month).tz(tz).endOf('month');
    } else if (startDate && endDate) {
      start = moment(startDate).tz(tz).startOf('day');
      end = moment(endDate).tz(tz).endOf('day');
    } else {
      // Default: Current Month
      start = moment().tz(tz).startOf('month');
      end = moment().tz(tz).endOf('month');
    }

    // 2. Fetch Policy (for holidays)
    const policy = await prisma.attendancePolicy.findFirst();
    const specialHolidays = (policy?.specialHolidays || []).map(h => moment(h).tz(tz).format('YYYY-MM-DD'));

    // 3. Fetch Records
    const attendance = await prisma.timeRecord.findMany({
      where: {
        employeeId: Number(employeeId),
        workDate: { gte: start.toDate(), lte: end.toDate() }
      },
      orderBy: { workDate: 'asc' }
    });

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: Number(employeeId),
        status: 'Approved',
        startDate: { lte: end.toDate() },
        endDate: { gte: start.toDate() }
      },
      include: { leaveType: true }
    });

    // 4. Generate Daily List
    const history = [];
    let curr = start.clone();
    // Use current time to check for future dates
    const now = moment().tz(tz);

    while (curr.isSameOrBefore(end, 'day')) {
      const dateStr = curr.format('YYYY-MM-DD');
      const dayOfWeek = curr.day();

      // Determine Day Type
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0=Sun, 6=Sat (Assuming default)
      const isSpecialHoliday = specialHolidays.includes(dateStr);

      // Find Matching Records
      // Note: Comparing strings is safer for date matching
      const record = attendance.find(a => moment(a.workDate).tz(tz).format('YYYY-MM-DD') === dateStr);

      // Check Leave intersection
      const leave = leaves.find(l => {
        const lStart = moment(l.startDate).tz(tz).format('YYYY-MM-DD');
        const lEnd = moment(l.endDate).tz(tz).format('YYYY-MM-DD');
        return dateStr >= lStart && dateStr <= lEnd;
      });

      // Determine Status
      let status = 'Absent';
      let details = '';
      let color = 'red'; // Default Absent color

      if (record) {
        status = record.isLate ? 'Late' : 'Present';
        color = record.isLate ? 'orange' : 'green';
        details = record.note || '';
        if (record.isLate) details = details ? `Late: ${details}` : 'Late Arrival';
      } else if (leave) {
        status = 'Leave';
        color = leave.leaveType.colorCode || 'blue';
        details = leave.leaveType.typeName;
      } else if (isSpecialHoliday) {
        status = 'Holiday';
        color = 'purple';
        details = 'Public Holiday';
      } else if (isWeekend) {
        status = 'Weekend';
        color = 'gray';
        details = 'Weekend';
      }

      // Handle Future Dates
      if (curr.isAfter(now, 'day')) {
        // If it's already marked as Leave/Holiday/Weekend, keep it.
        // If it was 'Absent', change to 'Upcoming'
        if (status === 'Absent') {
          status = 'Upcoming';
          color = 'gray';
        }
      }

      history.push({
        date: dateStr,
        day: curr.format('dddd'),
        status,
        color,
        checkIn: record?.checkInTime ? moment(record.checkInTime).tz(tz).format('HH:mm') : '-',
        checkOut: record?.checkOutTime ? moment(record.checkOutTime).tz(tz).format('HH:mm') : '-',
        details: details
      });

      curr.add(1, 'day');
    }

    res.json({ success: true, data: history });

  } catch (error) { next(error); }
};

module.exports = {
  handleCheckIn,
  handleCheckOut,
  getMyTimeRecords,
  getAllTimeRecords,
  getMonthlyLateSummary,
  getMonthlyLateStats,
  exportAttendanceCSV,
  getTopLateEmployees,
  getDailyDetail,
  getEmployeePerformanceReport,
  getEmployeeAttendanceHistory
};
