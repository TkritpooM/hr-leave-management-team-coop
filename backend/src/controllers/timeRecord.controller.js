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
        const start = moment(startDate).startOf('day').toDate();
        const end = moment(endDate).endOf('day').toDate();

        // 1. ดึงพนักงานทุกคน (หรือเฉพาะ isActive: true)
        const employees = await prisma.employee.findMany({
            where: { isActive: true },
            select: { employeeId: true, firstName: true, lastName: true, role: true }
        });

        // 2. ดึงข้อมูล Attendance และ Leave ทั้งหมดในช่วงวันที่เลือกมาประมวลผล
        const [allAttendance, allLeaves] = await Promise.all([
            prisma.timeRecord.findMany({
                where: { workDate: { gte: start, lte: end } }
            }),
            prisma.leaveRequest.findMany({
                where: {
                    status: 'Approved',
                    startDate: { lte: end },
                    endDate: { gte: start }
                },
                include: { leaveType: true }
            })
        ]);

        // 3. คำนวณสถิติรายบุคคล
        const report = employees.map(emp => {
            const myAttendance = allAttendance.filter(a => a.employeeId === emp.employeeId);
            const myLeaves = allLeaves.filter(l => l.employeeId === emp.employeeId);

            const presentCount = myAttendance.length;
            const lateCount = myAttendance.filter(a => a.isLate).length;
            
            // นับจำนวนวันลาจริง (ใช้ Logic หักวันหยุดจาก Service ถ้าต้องการความเป๊ะ)
            let totalLeaveDays = 0;
            myLeaves.forEach(l => {
                totalLeaveDays += parseFloat(l.totalDaysRequested);
            });

            return {
                employeeId: emp.employeeId,
                name: `${emp.firstName} ${emp.lastName}`,
                role: emp.role,
                presentCount,
                lateCount,
                leaveCount: totalLeaveDays,
                lateRate: presentCount > 0 ? Math.round((lateCount / presentCount) * 100) : 0
            };
        });

        // 4. สรุปประเภทการลา (สำหรับทำกราฟ Pie Chart)
        const leaveSummaryByType = {};
        allLeaves.forEach(l => {
            const typeName = l.leaveType.typeName;
            const days = parseFloat(l.totalDaysRequested);
            if (leaveSummaryByType[typeName]) {
                leaveSummaryByType[typeName] += days;
            } else {
                leaveSummaryByType[typeName] = days;
            }
        });

        // แปลงเป็น Array เพื่อให้ Frontend ใช้ง่าย
        const leaveChartData = Object.keys(leaveSummaryByType).map(name => ({
            name,
            value: leaveSummaryByType[name]
        }));

        // 5. คัดเลือกพนักงานดีเด่น (ไม่สาย ไม่ลา และมีวันมาทำงาน > 0)
        const perfectEmployees = report.filter(emp => 
            emp.presentCount > 0 && emp.lateCount === 0 && emp.leaveCount === 0
        );

        res.status(200).json({ 
            success: true, 
            data: {
                individualReport: report,
                leaveChartData: leaveChartData,
                perfectEmployees: perfectEmployees
            } 
        });
    } catch (error) { next(error); }
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