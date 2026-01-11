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
    const records = await prisma.timeRecord.findMany({
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { workDate: 'desc' }
    });

    let csv = 'Date,Employee Name,Check In,Check Out,Status\n';

    records.forEach(rec => {
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
      newValue: { rows: records.length },
      performedByEmployeeId: Number(req.user.employeeId),
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
    // Calculate skip/take for array slicing later
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;

    const whereCondition = {
      joiningDate: { lte: end.toDate() },
      OR: [
        { resignationDate: null },
        { resignationDate: { gte: start.toDate() } }
      ]
    };

    // 🔥 Change: Fetch ALL matching employees to calculate global stats
    const [employees, policy] = await Promise.all([
      prisma.employee.findMany({
        where: whereCondition,
        select: { employeeId: true, firstName: true, lastName: true, role: true, joiningDate: true },
        // No skip/take here -> In-memory pagination
      }),
      prisma.attendancePolicy.findFirst()
    ]);

    const totalCount = employees.length;
    const employeeIds = employees.map(e => e.employeeId);
    const specialHolidays = (policy?.specialHolidays || []).map(h => moment(h).format('YYYY-MM-DD'));
    const effectiveEnd = end.isAfter(today) ? today : end;

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

    const [allAttendance, allLeaves] = await Promise.all([
      prisma.timeRecord.findMany({
        where: { workDate: { gte: start.toDate(), lte: end.toDate() }, employeeId: { in: employeeIds } }
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'Approved',
          startDate: { lte: end.toDate() },
          endDate: { gte: start.toDate() },
          employeeId: { in: employeeIds }
        },
        include: { leaveType: true }
      })
    ]);

    // Calculate full report for ALL employees
    const report = employees.map(emp => {
      const myAtts = allAttendance.filter(a => a.employeeId === emp.employeeId);
      const myLeaves = allLeaves.filter(l => l.employeeId === emp.employeeId);
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

    // Global Summary (All employees)
    const summary = report.reduce((acc, r) => ({
      present: acc.present + r.presentCount,
      late: acc.late + r.lateCount,
      leave: acc.leave + r.leaveCount,
      absent: acc.absent + r.absentCount,
    }), { present: 0, late: 0, leave: 0, absent: 0 });

    const total = summary.present + summary.leave + summary.absent;
    const lateRate = summary.present > 0 ? Math.round((summary.late / summary.present) * 100) : 0;

    const finalSummary = { ...summary, total, lateRate };

    const leaveSummaryByType = {};
    allLeaves.forEach(l => {
      const typeName = l.leaveType.typeName;
      if (!leaveSummaryByType[typeName]) {
        leaveSummaryByType[typeName] = { name: typeName, value: 0, color: l.leaveType.colorCode || "#3b82f6" };
      }
      leaveSummaryByType[typeName].value += parseFloat(l.totalDaysRequested);
    });

    // Pagination Slice
    const paginatedReport = report.slice(startIndex, endIndex);

    // 🚩 1. คำนวณ Trend Data (รายวัน) สำหรับกราฟเส้น - เพิ่มส่วน Absent
    let trendData = [];
    let trendCurr = start.clone();
    while (trendCurr.isSameOrBefore(end, 'day')) {
      const dateStr = trendCurr.format('YYYY-MM-DD');
      const dayOfWeek = trendCurr.day();
      
      // กรองข้อมูลเฉพาะวันทำงาน (ไม่เอาเสาร์-อาทิตย์ และวันหยุดบริษัท)
      const isWorkDay = dayOfWeek !== 0 && dayOfWeek !== 6 && !specialHolidays.includes(dateStr);
      
      const dailyAtt = allAttendance.filter(a => moment(a.workDate).isSame(trendCurr, 'day'));
      const dailyLeave = allLeaves.filter(l => trendCurr.isBetween(moment(l.startDate), moment(l.endDate), 'day', '[]'));

      let dailyAbsent = 0;
      if (isWorkDay) {
        // คำนวณหาคนที่ไม่ได้มาทำงานและไม่ได้ลาในวันนั้น
        const presentAndLeaveIds = [
          ...dailyAtt.map(a => a.employeeId),
          ...dailyLeave.map(l => l.employeeId)
        ];
        // เฉพาะพนักงานที่เข้าทำงานแล้ว ณ วันนั้น
        dailyAbsent = employees.filter(emp => 
          !presentAndLeaveIds.includes(emp.employeeId) && 
          moment(emp.joiningDate).format('YYYY-MM-DD') <= dateStr
        ).length;
      }

      trendData.push({
        date: trendCurr.format('DD MMM'),
        present: dailyAtt.length - dailyAtt.filter(a => a.isLate).length,
        late: dailyAtt.filter(a => a.isLate).length,
        leave: dailyLeave.length,
        absent: dailyAbsent // ✅ เพิ่มค่าคนขาดรายวัน
      });
      trendCurr.add(1, 'day');
    }

    // 🚩 2. คำนวณ Monthly Comparison (ดึงค่าจริงเดือนก่อน: Present, Late, Absent)
    const lastMonthStart = start.clone().subtract(1, 'months').startOf('month');
    const lastMonthEnd = lastMonthStart.clone().endOf('month');
    
    // ดึงข้อมูลการมาทำงานและวันลาของเดือนที่แล้ว
    const [lastMonthAtts, lastMonthApprovedLeaves] = await Promise.all([
      prisma.timeRecord.findMany({
        where: { workDate: { gte: lastMonthStart.toDate(), lte: lastMonthEnd.toDate() }, employeeId: { in: employeeIds } },
        select: { isLate: true, workDate: true, employeeId: true }
      }),
      prisma.leaveRequest.findMany({
        where: { status: 'Approved', startDate: { lte: lastMonthEnd.toDate() }, endDate: { gte: lastMonthStart.toDate() }, employeeId: { in: employeeIds } }
      })
    ]);

    // สร้างลิสต์วันทำงานของเดือนที่แล้ว (เพื่อหา Absent)
    let lastMonthWorkDays = [];
    let lmCurr = lastMonthStart.clone();
    while (lmCurr.isSameOrBefore(lastMonthEnd, 'day')) {
      const dayOfWeek = lmCurr.day();
      const dateStr = lmCurr.format('YYYY-MM-DD');
      // ตรวจสอบเสาร์-อาทิตย์ และวันหยุดพิเศษ
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !specialHolidays.includes(dateStr)) {
        lastMonthWorkDays.push(dateStr);
      }
      lmCurr.add(1, 'day');
    }

    // คำนวณหา Absent รวมของเดือนที่แล้ว
    let lastMonthAbsentTotal = 0;
    employees.forEach(emp => {
      const empJoiningDate = moment(emp.joiningDate).format('YYYY-MM-DD');
      const myLmAtts = lastMonthAtts.filter(a => a.employeeId === emp.employeeId);
      const myLmLeaves = lastMonthApprovedLeaves.filter(l => l.employeeId === emp.employeeId);

      lastMonthWorkDays.forEach(day => {
        if (day >= empJoiningDate) {
          const hasAtt = myLmAtts.some(a => moment(a.workDate).format('YYYY-MM-DD') === day);
          const hasLeave = myLmLeaves.some(l => day >= moment(l.startDate).format('YYYY-MM-DD') && day <= moment(l.endDate).format('YYYY-MM-DD'));
          if (!hasAtt && !hasLeave) lastMonthAbsentTotal++;
        }
      });
    });

    const lastMonthLateCount = lastMonthAtts.filter(a => a.isLate).length;
    const monthlyComparison = [
      { 
        month: lastMonthStart.format('MMMM YYYY'), 
        present: lastMonthAtts.length - lastMonthLateCount, 
        late: lastMonthLateCount, 
        absent: lastMonthAbsentTotal // ✅ ได้ค่าจริงแล้ว
      },
      { 
        month: 'Current Period', 
        present: summary.present, 
        late: summary.late, 
        absent: summary.absent 
      }
    ];

    const perfectEmployees = report
      .filter(emp => emp.presentCount > 0 && emp.lateCount === 0 && emp.absentCount === 0)
      .map(emp => ({
        employeeId: emp.employeeId,
        name: emp.name
      }))
      .slice(0, 5); // เอามาแค่ 5 คนพอให้ดู Minimal

    res.status(200).json({
      success: true,
      data: {
        individualReport: paginatedReport, // Only return current page
        leaveChartData: Object.values(leaveSummaryByType),
        summary: finalSummary, // 🔥 New: Global Summary
        trendData, // ✅ กราฟเส้น
        monthlyComparison, // ✅ กราฟเปรียบเทียบ
        perfectEmployees,
        pagination: {
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          currentPage: pageNum,
          limit: limitNum
        }
      }
    });
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
  getEmployeePerformanceReport
};
