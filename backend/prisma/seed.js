// backend/prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const prisma = new PrismaClient();

const TIMEZONE = 'Asia/Bangkok';

const userData = [
    { email: 'admin@company.com', role: 'Admin', firstName: 'System', lastName: 'Admin', password: 'Password123', joiningDate: '2022-01-01' },
    { email: 'hr.manager@company.com', role: 'HR', firstName: 'HR', lastName: 'Manager', password: 'Password123', joiningDate: '2023-01-01' },
    { email: 'worker.a@company.com', role: 'Worker', firstName: 'Alice', lastName: 'WorkerA', password: 'Password123', joiningDate: '2023-06-15' },
    { email: 'worker.b@company.com', role: 'Worker', firstName: 'Bob', lastName: 'WorkerB', password: 'Password123', joiningDate: '2024-03-01' },
    { email: 'worker.c@company.com', role: 'Supervisor', firstName: 'Charlie', lastName: 'WorkerC', password: 'Password123', joiningDate: '2024-01-15' },
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
    await prisma.permission.deleteMany(); // Clear Permissions
    console.log('✅ Old data cleared successfully.');

    // --- 1.0 Create Permissions ---
    const DEFAULT_PERMISSIONS = [
        { name: 'access_worker_dashboard', description: 'Access Worker Dashboard' },
        { name: 'access_hr_dashboard', description: 'Access HR Dashboard' },
        { name: 'access_admin_dashboard', description: 'Access Admin Dashboard' },
        { name: 'access_employee_list', description: 'View and Manage Employees' },
        { name: 'access_role_management', description: 'Manage Roles and Permissions' },
        { name: 'access_leave_approval', description: 'Approve Leave Requests' },
        { name: 'access_leave_settings', description: 'Manage Leave Allocations and Types' },
        { name: 'access_attendance_policy', description: 'Manage Attendance Policies' },
        { name: 'access_profile_requests', description: 'Approve Profile Change Requests' },
        { name: 'access_attendance_list', description: 'View Employee Attendance' },
        { name: 'access_my_attendance', description: 'View Own Attendance' },
        { name: 'access_my_leaves', description: 'View Own Leaves' },
        // New permissions requested
        { name: 'access_view_profile', description: 'View Own Profile' },
        { name: 'access_view_notifications', description: 'View Notifications' },
        { name: 'access_audit_log', description: 'View Audit Logs' },
        // Manage permissions
        { name: 'manage_employees', description: 'Create, Edit, Delete Employees' },
        { name: 'manage_leave_settings', description: 'Create, Edit Leave Types and Quotas' },
        { name: 'manage_attendance_policy', description: 'Update Attendance Policy and Holidays' },
    ];

    const permMap = {}; // name -> id
    for (const p of DEFAULT_PERMISSIONS) {
        const created = await prisma.permission.create({ data: p });
        permMap[p.name] = created.permissionId;
    }
    console.log(`✅ Created ${DEFAULT_PERMISSIONS.length} permissions.`);

    // --- 1.1 Create Roles with Defaults ---
    const rolesDef = [
        {
            name: 'Admin',
            perms: Object.values(permMap) // All permissions
        },
        {
            name: 'HR',
            perms: [
                permMap['access_hr_dashboard'],
                permMap['access_employee_list'],
                permMap['manage_employees'], // HR can manage employees
                permMap['access_leave_approval'],
                permMap['access_leave_settings'],
                permMap['manage_leave_settings'], // HR can manage leave settings
                permMap['access_attendance_policy'],
                permMap['manage_attendance_policy'], // HR can manage attendance policy
                permMap['access_profile_requests'],
                permMap['access_attendance_list'],
                // HR is also a worker? Maybe give them worker access too if they have "My Attendance"
                permMap['access_my_attendance'],
                permMap['access_my_leaves'],
                permMap['access_view_profile'],
                permMap['access_view_notifications'],
                permMap['access_audit_log'],
            ]
        },
        {
            name: 'Supervisor',
            perms: [
                // Supervisor Access
                permMap['access_hr_dashboard'],     // Access HR Dashboard
                permMap['access_employee_list'],    // Access Employee List (View Only, no Manage)
                permMap['access_attendance_policy'],
                permMap['access_leave_settings'],
            ]
        },
        {
            name: 'Worker',
            perms: [
                permMap['access_worker_dashboard'],
                permMap['access_my_attendance'],
                permMap['access_my_leaves'],
                permMap['access_view_profile'],
                permMap['access_view_notifications'],
            ]
        }
    ];

    const roleMap = {};
    for (const r of rolesDef) {
        const createdRole = await prisma.role.create({
            data: {
                roleName: r.name,
                permissions: {
                    connect: r.perms.map(id => ({ permissionId: id }))
                }
            }
        });
        roleMap[r.name] = createdRole.roleId;
    }
    console.log('✅ Roles created with permissions:', Object.keys(roleMap));

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