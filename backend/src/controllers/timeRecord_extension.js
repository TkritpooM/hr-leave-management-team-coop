
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
