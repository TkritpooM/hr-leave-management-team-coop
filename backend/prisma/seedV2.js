const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('เริ่มการจำลองข้อมูล (Seeding)...');

  // 1. ล้างข้อมูลเก่าออกก่อน (ลบจากตารางที่มีความสัมพันธ์ก่อน)
  await prisma.notification.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveQuota.deleteMany();
  await prisma.timeRecord.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.leaveType.deleteMany();

  // 2. สร้างประเภทการลา (LeaveType)
  console.log('สร้างประเภทการลา...');
  const annualLeave = await prisma.leaveType.create({
    data: {
      typeName: 'Annual Leave',
      isPaid: true,
      defaultDays: 6.00,
      canCarryForward: true,
      maxCarryDays: 5.00,
    },
  });

  const sickLeave = await prisma.leaveType.create({
    data: {
      typeName: 'Sick Leave',
      isPaid: true,
      defaultDays: 30.00,
    },
  });

  const unpaidLeave = await prisma.leaveType.create({
    data: {
      typeName: 'Unpaid Leave',
      isPaid: false,
      defaultDays: 0.00,
    },
  });

  // 3. สร้างพนักงาน (Employee)
  console.log('สร้างพนักงาน...');
  const userData = [
    { email: 'hr.manager@company.com', role: 'HR', firstName: 'HR', lastName: 'Manager', password: 'Password123', joiningDate: '2023-01-01' },
    { email: 'worker.a@company.com', role: 'Worker', firstName: 'Alice', lastName: 'WorkerA', password: 'Password123', joiningDate: '2023-06-15' },
    { email: 'worker.b@company.com', role: 'Worker', firstName: 'Bob', lastName: 'WorkerB', password: 'Password123', joiningDate: '2024-03-01' },
  ];

  const employees = [];
  for (const u of userData) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(u.password, salt);
    
    const emp = await prisma.employee.create({
      data: {
        email: u.email,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash: hash,
        joiningDate: new Date(u.joiningDate),
      },
    });
    employees.push(emp);
  }

  // 4. สร้างโควต้าการลา (LeaveQuota) - จำลองปี 2024 และ 2025
  console.log('สร้างโควต้าการลา...');
  const currentYear = 2025;
  for (const emp of employees) {
    // โควต้าพักร้อน (Annual Leave)
    await prisma.leaveQuota.create({
      data: {
        employeeId: emp.employeeId,
        leaveTypeId: annualLeave.leaveTypeId,
        year: currentYear,
        totalDays: 6.00,
        usedDays: 0.00,
        carriedOverDays: emp.firstName === 'Alice' ? 2.50 : 0.00, // สมมติ Alice มีวันเหลือจากปีที่แล้ว
      },
    });
    // โควต้าลาป่วย (Sick Leave)
    await prisma.leaveQuota.create({
      data: {
        employeeId: emp.employeeId,
        leaveTypeId: sickLeave.leaveTypeId,
        year: currentYear,
        totalDays: 30.00,
        usedDays: 0.00,
      },
    });
  }

  // 5. สร้างวันหยุดนักขัตฤกษ์ (Holiday)
  console.log('สร้างวันหยุด...');
  await prisma.holiday.createMany({
    data: [
      { holidayDate: new Date('2025-01-01'), holidayName: "New Year's Day" },
      { holidayDate: new Date('2025-04-13'), holidayName: "Songkran Festival" },
      { holidayDate: new Date('2025-04-14'), holidayName: "Songkran Festival" },
      { holidayDate: new Date('2025-04-15'), holidayName: "Songkran Festival" },
      { holidayDate: new Date('2025-05-01'), holidayName: "Labor Day" },
    ],
  });

  // 6. สร้างบันทึกเวลาทำงาน (TimeRecord) - จำลองย้อนหลัง 2 วัน
  console.log('สร้างบันทึกเวลาทำงาน...');
  const alice = employees.find(e => e.firstName === 'Alice');
  if (alice) {
    await prisma.timeRecord.createMany({
      data: [
        {
          employeeId: alice.employeeId,
          workDate: new Date('2025-01-20'),
          checkInTime: new Date('2025-01-20T08:00:00Z'),
          checkOutTime: new Date('2025-01-20T17:00:00Z'),
          isLate: false,
        },
        {
          employeeId: alice.employeeId,
          workDate: new Date('2025-01-21'),
          checkInTime: new Date('2025-01-21T08:45:00Z'), // สาย
          checkOutTime: new Date('2025-01-21T17:30:00Z'),
          isLate: true,
        },
      ],
    });
  }

  // 7. สร้างคำขอลา (LeaveRequest) และการแจ้งเตือน
  console.log('สร้างคำขอลา...');
  const bob = employees.find(e => e.firstName === 'Bob');
  const hr = employees.find(e => e.role === 'HR');

  if (bob) {
    const leaveReq = await prisma.leaveRequest.create({
      data: {
        employeeId: bob.employeeId,
        leaveTypeId: annualLeave.leaveTypeId,
        startDate: new Date('2025-02-10'),
        endDate: new Date('2025-02-11'),
        totalDaysRequested: 2.00,
        startDuration: 'Full',
        endDuration: 'Full',
        reason: 'Going to the beach with family',
        status: 'Pending',
      },
    });

    // สร้าง Notification ให้ HR
    await prisma.notification.create({
      data: {
        employeeId: hr.employeeId,
        notificationType: 'NewRequest',
        message: `New leave request from ${bob.firstName} ${bob.lastName}`,
        relatedRequestId: leaveReq.requestId,
      },
    });
  }

  console.log('การ Seeding ข้อมูลเสร็จสมบูรณ์แล้ว! ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });