// backend/prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const prisma = new PrismaClient();

const TIMEZONE = 'Asia/Bangkok';

const userData = [
    { email: 'hr.manager@company.com', role: 'HR', firstName: 'HR', lastName: 'Manager', password: 'Password123', joiningDate: '2023-01-01' },
    { email: 'worker.a@company.com', role: 'Worker', firstName: 'Alice', lastName: 'WorkerA', password: 'Password123', joiningDate: '2023-06-15' },
    { email: 'worker.b@company.com', role: 'Worker', firstName: 'Bob', lastName: 'WorkerB', password: 'Password123', joiningDate: '2024-03-01' },
];

const leaveTypeData = [
    { typeName: 'Annual Leave', isPaid: true },
    { typeName: 'Sick Leave', isPaid: true },
    { typeName: 'Unpaid Leave', isPaid: false },
];

async function main() {
    console.log(`\n--- Starting Seeding Process ---`);

    // --- 1. Cleanup Old Data ---
    // ลบข้อมูลจากตารางที่มี Foreign Key ก่อน
    await prisma.notification.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.timeRecord.deleteMany();
    await prisma.leaveQuota.deleteMany();
    await prisma.leaveType.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.role.deleteMany(); // Clear Roles
    console.log('✅ Old data cleared successfully.');

    // --- 1.1 Create Roles ---
    const roles = ['Admin', 'HR', 'Worker'];
    const roleMap = {};
    for (const r of roles) {
        const createdRole = await prisma.role.create({ data: { roleName: r } });
        roleMap[r] = createdRole.roleId;
    }
    console.log('✅ Roles created:', roleMap);

    // --- 2. Create Employees ---
    const employees = [];
    for (const user of userData) {
        const passwordHash = await bcrypt.hash(user.password, 10);

        // **แก้ไข:** ใช้ Destructuring เพื่อแยก password ออกจาก Object ก่อนส่งให้ Prisma
        const { password, role, ...userDataWithoutPassword } = user;

        const employee = await prisma.employee.create({
            data: {
                ...userDataWithoutPassword, // ใช้ Object ที่ไม่มี 'password' และ 'role' string
                passwordHash,
                roleId: roleMap[role] || roleMap['Worker'], // Assign Role ID
                joiningDate: moment.tz(userDataWithoutPassword.joiningDate, TIMEZONE).toDate(),
            },
            include: { role: true } // Include role to check
        });
        employees.push(employee);
    }
    const hr = employees.find(e => e.role.roleName === 'HR');
    const workerA = employees.find(e => e.email === 'worker.a@company.com');
    const workerB = employees.find(e => e.email === 'worker.b@company.com');
    console.log(`✅ Created ${employees.length} employees (HR ID: ${hr.employeeId})`);

    // --- 3. Create Leave Types ---
    const leaveTypes = [];
    for (const type of leaveTypeData) {
        const leaveType = await prisma.leaveType.create({ data: type });
        leaveTypes.push(leaveType);
    }
    const annualLeave = leaveTypes.find(t => t.typeName === 'Annual Leave');
    const sickLeave = leaveTypes.find(t => t.typeName === 'Sick Leave');
    console.log(`✅ Created ${leaveTypes.length} leave types.`);

    // --- 4. Create Holidays (ปี 2025) ---
    await prisma.holiday.createMany({
        data: [
            { holidayName: 'New Year Day', holidayDate: moment.tz('2025-01-01', TIMEZONE).toDate() },
            { holidayName: 'Labour Day', holidayDate: moment.tz('2025-05-01', TIMEZONE).toDate() },
            { holidayName: 'Christmas Day', holidayDate: moment.tz('2025-12-25', TIMEZONE).toDate() },
            // วันหยุดสุดสัปดาห์ (Weekend) ที่เป็นวันสำคัญ (ไม่ใช่ Holiday, แต่ใช้เป็นตัวอย่าง)
            { holidayName: 'Long Weekend Test (Sat)', holidayDate: moment.tz('2025-12-20', TIMEZONE).toDate() },
            { holidayName: 'Long Weekend Test (Sun)', holidayDate: moment.tz('2025-12-21', TIMEZONE).toDate() },
        ],
    });
    console.log(`✅ Created Holiday data.`);

    // --- 5. Create Leave Quotas (Current Year: 2025) ---
    const currentYear = moment().year();

    // Worker A: Annual 10 days, Sick 5 days
    await prisma.leaveQuota.createMany({
        data: [
            { employeeId: workerA.employeeId, leaveTypeId: annualLeave.leaveTypeId, year: currentYear, totalDays: 10.00, usedDays: 1.50 },
            { employeeId: workerA.employeeId, leaveTypeId: sickLeave.leaveTypeId, year: currentYear, totalDays: 5.00, usedDays: 0.00 },
        ],
    });

    // Worker B: Annual 12 days
    await prisma.leaveQuota.createMany({
        data: [
            { employeeId: workerB.employeeId, leaveTypeId: annualLeave.leaveTypeId, year: currentYear, totalDays: 12.00, usedDays: 5.00 },
        ],
    });
    console.log(`✅ Created Leave Quota data for ${currentYear}.`);

    // --- 6. Create Time Records ---
    const today = moment.tz(TIMEZONE);
    const yesterday = today.clone().subtract(1, 'day');
    const lastWeek = today.clone().subtract(7, 'days');

    // Worker A: On Time (yesterday)
    await prisma.timeRecord.create({
        data: {
            employeeId: workerA.employeeId,
            workDate: yesterday.toDate(),
            checkInTime: yesterday.clone().set({ hour: 8, minute: 55, second: 0 }).toDate(),
            checkOutTime: yesterday.clone().set({ hour: 17, minute: 30, second: 0 }).toDate(),
            isLate: false,
        },
    });

    // Worker A: LATE (today) - ยังไม่ Check Out
    await prisma.timeRecord.create({
        data: {
            employeeId: workerA.employeeId,
            workDate: today.toDate(),
            checkInTime: today.clone().set({ hour: 9, minute: 5, second: 0 }).toDate(),
            checkOutTime: null,
            isLate: true,
        },
    });

    // Worker B: Late (History)
    await prisma.timeRecord.create({
        data: {
            employeeId: workerB.employeeId,
            workDate: lastWeek.toDate(),
            checkInTime: lastWeek.clone().set({ hour: 9, minute: 20, second: 0 }).toDate(),
            checkOutTime: lastWeek.clone().set({ hour: 18, minute: 0, second: 0 }).toDate(),
            isLate: true,
        },
    });
    console.log(`✅ Created Time Record data.`);

    // --- 7. Create Leave Requests ---

    // 1. Pending Request (Worker A)
    const pendingReq = await prisma.leaveRequest.create({
        data: {
            employeeId: workerA.employeeId,
            leaveTypeId: annualLeave.leaveTypeId,
            startDate: moment.tz('2026-01-10', TIMEZONE).toDate(),
            endDate: moment.tz('2026-01-10', TIMEZONE).toDate(),
            totalDaysRequested: 1.00,
            startDuration: 'Full', endDuration: 'Full',
            reason: 'Vacation planning',
            status: 'Pending',
        }
    });

    // 2. Approved Request (Worker B - 5 days already used)
    await prisma.leaveRequest.create({
        data: {
            employeeId: workerB.employeeId,
            leaveTypeId: annualLeave.leaveTypeId,
            startDate: moment.tz('2025-11-01', TIMEZONE).toDate(),
            endDate: moment.tz('2025-11-05', TIMEZONE).toDate(),
            totalDaysRequested: 5.00,
            startDuration: 'Full', endDuration: 'Full',
            reason: 'Long weekend trip',
            status: 'Approved',
            approvedByHrId: hr.employeeId,
            approvalDate: new Date(),
        }
    });

    // 3. Rejected Request (Worker B)
    await prisma.leaveRequest.create({
        data: {
            employeeId: workerB.employeeId,
            leaveTypeId: sickLeave.leaveTypeId,
            startDate: moment.tz('2025-12-20', TIMEZONE).toDate(),
            endDate: moment.tz('2025-12-20', TIMEZONE).toDate(),
            totalDaysRequested: 1.00,
            startDuration: 'Full', endDuration: 'Full',
            reason: 'Rejected test',
            status: 'Rejected',
            approvedByHrId: hr.employeeId,
            approvalDate: new Date(),
        }
    });
    console.log(`✅ Created Leave Request data.`);

    // --- 8. Create Notification (New Request for HR) ---
    await prisma.notification.create({
        data: {
            employeeId: hr.employeeId,
            notificationType: 'NewRequest',
            message: `New pending leave request (ID: ${pendingReq.requestId}) from Worker A.`,
            relatedRequestId: pendingReq.requestId,
            isRead: false,
        }
    });
    console.log(`✅ Created Notification for HR.`);
    console.log(`--- Seeding Process Finished ---`);

}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });