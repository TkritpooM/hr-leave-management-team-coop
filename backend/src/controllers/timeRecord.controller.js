const timeRecordService = require('../services/timeRecord.service');
const prisma = require('../models/prisma');
const moment = require('moment-timezone');

const handleCheckIn = async (req, res, next) => {
    try {
        const employeeId = req.user.employeeId;
        const record = await timeRecordService.checkIn(employeeId);
        
        const message = record.isLate ? 'Check-in successful, but recorded as LATE.' : 'Check-in successful.';
        res.status(201).json({ success: true, message, record });
    } catch (error) { next(error); }
};

const handleCheckOut = async (req, res, next) => {
    try {
        const employeeId = req.user.employeeId;
        const record = await timeRecordService.checkOut(employeeId);
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
            include: { employee: { select: { employeeId: true, firstName: true, lastName: true } } },
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

        const targetDate = moment(date).startOf('day').toDate();
        const endOfTargetDate = moment(date).endOf('day').toDate();

        const allEmployees = await prisma.employee.findMany({
            where: { isActive: true },
            select: { employeeId: true, firstName: true, lastName: true, role: true }
        });

        const attendance = await prisma.timeRecord.findMany({
            where: { workDate: { gte: targetDate, lte: endOfTargetDate } },
            include: { employee: true }
        });

        const leaves = await prisma.leaveRequest.findMany({
            where: {
                status: 'Approved',
                startDate: { lte: endOfTargetDate },
                endDate: { gte: targetDate }
            },
            include: { 
                employee: true, 
                leaveType: true,
                // ✅ แก้ไข: ถ้าชื่อฟิลด์ใน Prisma ของคุณไม่ใช่ approvedByHr ให้ลองเปลี่ยนตาม Schema
                approvedByHR: { select: { firstName: true, lastName: true } } 
            }
        });

        const presentIds = attendance.map(a => a.employeeId);
        const leaveIds = leaves.map(l => l.employeeId);

        const absent = allEmployees.filter(emp => 
            !presentIds.includes(emp.employeeId) && !leaveIds.includes(emp.employeeId)
        );

        res.status(200).json({
            success: true,
            data: {
                present: attendance,
                leaves: leaves,
                absent: absent,
                summary: {
                    total: allEmployees.length,
                    presentCount: attendance.length,
                    leaveCount: leaves.length,
                    absentCount: absent.length
                }
            }
        });
    } catch (error) {
        console.error("DEBUG BACKEND ERROR:", error); // 🔥 พิมพ์ Error ออกมาดูใน Console Backend
        next(error);
    }
};

const getEmployeePerformanceReport = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const start = moment(startDate).tz("Asia/Bangkok").startOf('day');
        const end = moment(endDate).tz("Asia/Bangkok").endOf('day');
        const today = moment().tz("Asia/Bangkok").startOf('day');

        // 1. ดึงพนักงานทุกคน
        const employees = await prisma.employee.findMany({
            where: { isActive: true },
            select: { employeeId: true, firstName: true, lastName: true, role: true }
        });

        // 2. ดึงข้อมูลวันทำงานจริง (จันทร์-ศุกร์) ในช่วงวันที่เลือก
        let workDays = [];
        let curr = start.clone();
        while (curr.isSameOrBefore(end, 'day')) {
            const dayOfWeek = curr.day();
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && curr.isSameOrBefore(today, 'day')) {
                workDays.push(curr.format('YYYY-MM-DD'));
            }
            curr.add(1, 'day');
        }

        // 3. ดึง Attendance และ Approved Leaves
        const [allAttendance, allLeaves] = await Promise.all([
            prisma.timeRecord.findMany({
                where: { workDate: { gte: start.toDate(), lte: end.toDate() } }
            }),
            prisma.leaveRequest.findMany({
                where: {
                    status: 'Approved',
                    startDate: { lte: end.toDate() },
                    endDate: { gte: start.toDate() }
                },
                include: { leaveType: true }
            })
        ]);

        // --- 🆕 เพิ่มส่วนที่หายไป: สรุปประเภทการลาสำหรับ Pie Chart ---
        const leaveSummaryByType = {};
        allLeaves.forEach(l => {
            const typeName = l.leaveType.typeName;
            const color = l.leaveType.colorCode || "#3b82f6";
            const days = parseFloat(l.totalDaysRequested);

            if (!leaveSummaryByType[typeName]) {
                leaveSummaryByType[typeName] = { name: typeName, value: 0, color: color };
            }
            leaveSummaryByType[typeName].value += days;
        });

        const leaveChartData = Object.values(leaveSummaryByType);
        // -------------------------------------------------------

        // 4. คำนวณสถิติรายบุคคล (รวม Absent)
        const report = employees.map(emp => {
            const myAtts = allAttendance.filter(a => a.employeeId === emp.employeeId);
            const myLeaves = allLeaves.filter(l => l.employeeId === emp.employeeId);

            const presentCount = myAtts.length;
            const lateCount = myAtts.filter(a => a.isLate).length;
            const leaveCount = myLeaves.reduce((sum, l) => sum + parseFloat(l.totalDaysRequested), 0);

            // คำนวณวันขาดงาน (Absent)
            let absentCount = 0;
            workDays.forEach(day => {
                const hasAtt = myAtts.some(a => moment(a.workDate).format('YYYY-MM-DD') === day);
                const hasLeave = myLeaves.some(l => {
                    const lStart = moment(l.startDate).format('YYYY-MM-DD');
                    const lEnd = moment(l.endDate).format('YYYY-MM-DD');
                    return day >= lStart && day <= lEnd;
                });
                if (!hasAtt && !hasLeave) absentCount++;
            });

            return {
                employeeId: emp.employeeId,
                name: `${emp.firstName} ${emp.lastName}`,
                role: emp.role,
                presentCount,
                lateCount,
                leaveCount,
                absentCount,
                lateRate: presentCount > 0 ? Math.round((lateCount / presentCount) * 100) : 0
            };
        });

        // 5. คัดเลือกพนักงานดีเด่น
        const perfectEmployees = report.filter(emp => 
            emp.presentCount > 0 && emp.lateCount === 0 && emp.leaveCount === 0 && emp.absentCount === 0
        );

        res.status(200).json({ 
            success: true, 
            data: {
                individualReport: report,
                leaveChartData: leaveChartData,
                perfectEmployees: perfectEmployees
            } 
        });
    } catch (error) { 
        console.error("Report Error:", error);
        next(error); 
    }
};

// 👇 บรรทัดนี้สำคัญมากครับ ต้องมีปิดท้ายไฟล์เสมอ ห้ามขาด!
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