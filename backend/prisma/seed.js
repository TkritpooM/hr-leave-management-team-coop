const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const prisma = new PrismaClient();

const TIMEZONE = 'Asia/Bangkok';

async function main() {
    console.log(`\n--- Starting Seeding Process ---`);

    // --- 1. Cleanup Old Data (เรียงลำดับตามความสัมพันธ์) ---
    console.log('Cleaning up old data...');
    await prisma.auditLog.deleteMany(); // ต้องลบก่อนเพราะเชื่อมกับ Employee 
    await prisma.notification.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.timeRecord.deleteMany();
    await prisma.leaveQuota.deleteMany();
    await prisma.leaveType.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.profileUpdateRequest.deleteMany();
    await prisma.attendancePolicy.deleteMany();
    await prisma.employee.deleteMany();
    console.log('✅ Old data cleared successfully.');

    const passwordHash = await bcrypt.hash('Password123', 10);
    const now = new Date();

    // --- 2. Create Attendance Policy (เพื่อให้หน้า Dashboard ไม่ว่าง) ---
    await prisma.attendancePolicy.create({
        data: {
            policyId: 1, // บังคับ ID เป็น 1 ตาม Schema 
            startTime: "09:00",
            endTime: "18:00",
            breakStartTime: "12:00",
            breakEndTime: "13:00",
            graceMinutes: 5,
            workingDays: "mon,tue,wed,thu,fri"
        }
    });
    console.log('✅ Created Attendance Policy.');

    // --- 3. Create Employees ---
    const hr = await prisma.employee.create({
        data: {
            email: 'hr.manager@company.com',
            firstName: 'HR',
            lastName: 'Manager',
            passwordHash: passwordHash, // ใช้ฟิลด์ตาม Schema [cite: 2]
            role: 'HR',
            isActive: true, // เพิ่มฟิลด์บังคับ [cite: 3]
            joiningDate: moment.tz('2023-01-01', TIMEZONE).toDate(), // ใช้ DateTime [cite: 2]
        }
    });

    const workerA = await prisma.employee.create({
        data: {
            email: 'worker.a@company.com',
            firstName: 'Alice',
            lastName: 'WorkerA',
            passwordHash: passwordHash,
            role: 'Worker',
            isActive: true,
            joiningDate: moment.tz('2023-06-15', TIMEZONE).toDate(),
        }
    });

    const workerB = await prisma.employee.create({
        data: {
            email: 'worker.b@company.com',
            firstName: 'Bob',
            lastName: 'WorkerB',
            passwordHash: passwordHash,
            role: 'Worker',
            isActive: true,
            joiningDate: moment.tz('2024-03-01', TIMEZONE).toDate(),
        }
    });
    console.log('✅ Created 3 Employees.');

    // --- 4. Create Leave Types ---
    const annualLeave = await prisma.leaveType.create({
        data: { typeName: 'Annual Leave', isPaid: true, colorCode: '#10b981', defaultDays: 10.00 }
    });
    const sickLeave = await prisma.leaveType.create({
        data: { typeName: 'Sick Leave', isPaid: true, colorCode: '#ef4444', defaultDays: 30.00 }
    });
    console.log('✅ Created Leave Types.');

    // --- 5. Create Leave Quotas (ปีปัจจุบัน) ---
    const currentYear = moment().year();
    await prisma.leaveQuota.createMany({
        data: [
            { employeeId: workerA.employeeId, leaveTypeId: annualLeave.leaveTypeId, year: currentYear, totalDays: 10.00, usedDays: 0 },
            { employeeId: workerA.employeeId, leaveTypeId: sickLeave.leaveTypeId, year: currentYear, totalDays: 30.00, usedDays: 0 },

            { employeeId: workerB.employeeId, leaveTypeId: annualLeave.leaveTypeId, year: currentYear, totalDays: 10.00, usedDays: 0 },
            { employeeId: workerB.employeeId, leaveTypeId: sickLeave.leaveTypeId, year : currentYear,totalDays: 10.00, usedDays: 0 },
        ] 
    });
    console.log(`✅ Created Leave Quotas for year ${currentYear}.`);

    // --- 6. Create Sample Time Records ---
    const yesterday = moment.tz(TIMEZONE).subtract(1, 'day').startOf('day');
    await prisma.timeRecord.create({
        data: {
            employeeId: workerA.employeeId,
            workDate: yesterday.toDate(),
            checkInTime: yesterday.clone().set({ hour: 8, minute: 50 }).toDate(),
            checkOutTime: yesterday.clone().set({ hour: 17, minute: 30 }).toDate(),
            isLate: false
        }
    });
    //7-- create departments 
        const departments = [
            {deptName: "IT",description: "Information Technology"},
            {deptName: "HR", description: "Human Resources"}
        ];
        for (const dept of departments){
            await prisma.departments.create({data: dept})
        }
    console.log('✅ Created sample Time Records.');

    console.log(`--- Seeding Process Finished Successfully ---`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });