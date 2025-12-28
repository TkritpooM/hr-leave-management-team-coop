// backend/src/controllers/admin.controller.js

const prisma = require('../models/prisma');
const bcrypt = require('bcrypt');
const CustomError = require('../utils/customError');

// --- 🆕 Employee Management (NEW) ---

// ดึงรายชื่อพนักงานทั้งหมดสำหรับหน้า Employees
const getAllEmployees = async (req, res, next) => {
    try {
        const employees = await prisma.employee.findMany({
            select: {
                employeeId: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                joiningDate: true,
                isActive: true
            },
            orderBy: { employeeId: 'asc' }
        });
        res.status(200).json({ success: true, employees });
    } catch (error) { next(error); }
};

// ดึง Quota เฉพาะของพนักงานคนนั้นๆ (ใช้ตอนเปิด Modal Set Quota)
const getEmployeeQuota = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.params.employeeId);
        const year = new Date().getFullYear(); // หรือรับจาก query ก็ได้

        const quotas = await prisma.leaveQuota.findMany({
            where: { employeeId, year },
            include: { leaveType: true }
        });
        res.status(200).json({ success: true, quotas });
    } catch (error) { next(error); }
};

// อัปเดต Quota แบบหลายรายการพร้อมกัน (ใช้ตอนกด Save ใน Modal)
const updateEmployeeQuotaBulk = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.params.employeeId);
        const { quotas } = req.body; // รับเป็น [{leaveTypeId: 1, totalDays: 10}, ...]
        const year = new Date().getFullYear();

        // ใช้ Transaction เพื่อให้มั่นใจว่าข้อมูลอัปเดตครบทุกแถว
        await prisma.$transaction(
            quotas.map((q) =>
                prisma.leaveQuota.upsert({
                    where: {
                        employeeId_leaveTypeId_year: {
                            employeeId,
                            leaveTypeId: q.leaveTypeId,
                            year
                        }
                    },
                    update: { totalDays: parseFloat(q.totalDays) },
                    create: {
                        employeeId,
                        leaveTypeId: q.leaveTypeId,
                        year,
                        totalDays: parseFloat(q.totalDays),
                        usedDays: 0
                    }
                })
            )
        );

        res.status(200).json({ success: true, message: "Quotas updated successfully" });
    } catch (error) { next(error); }
};

// --- Leave Type Management (CRUD) ---
const getLeaveTypes = async (req, res, next) => {
    try {
        const types = await prisma.leaveType.findMany({ orderBy: { typeName: 'asc' } });
        res.status(200).json({ success: true, types });
    } catch (error) { next(error); }
};

const createLeaveType = async (req, res, next) => {
    try {
        const { typeName, isPaid, defaultDays, canCarryForward, maxCarryDays, colorCode } = req.body;
        const newType = await prisma.leaveType.create({ 
            data: { 
                typeName, 
                isPaid: isPaid !== undefined ? isPaid : true,
                defaultDays: parseFloat(defaultDays) || 0,
                canCarryForward: !!canCarryForward,
                maxCarryDays: parseFloat(maxCarryDays) || 0,
                colorCode: colorCode || "#3b82f6"
            } 
        });
        res.status(201).json({ success: true, message: 'Leave type created.', type: newType });
    } catch (error) { next(error); }
};

const updateLeaveType = async (req, res, next) => {
    try {
        const leaveTypeId = parseInt(req.params.leaveTypeId);
        const { typeName, isPaid, defaultDays, canCarryForward, maxCarryDays, colorCode } = req.body;
        const updatedType = await prisma.leaveType.update({ 
            where: { leaveTypeId }, 
            data: { 
                typeName, 
                isPaid, 
                defaultDays: parseFloat(defaultDays),
                canCarryForward: !!canCarryForward,
                maxCarryDays: parseFloat(maxCarryDays) || 0,
                colorCode: colorCode
            } 
        });
        res.status(200).json({ success: true, message: 'Leave type updated.', type: updatedType });
    } catch (error) { next(error); }
};

const deleteLeaveType = async (req, res, next) => {
    try {
        await prisma.leaveType.delete({ where: { leaveTypeId: parseInt(req.params.leaveTypeId) } });
        res.status(200).json({ success: true, message: 'Leave type deleted successfully.' });
    } catch (error) {
        if (error.code === 'P2025') { return next(CustomError.notFound(`Leave type ID ${req.params.leaveTypeId} not found.`)); }
        next(error);
    }
};

// --- Leave Quota Management (CRUD เดิม) ---
const getQuotas = async (req, res, next) => {
    try {
        const quotas = await prisma.leaveQuota.findMany({
            include: { employee: { select: { employeeId: true, firstName: true, lastName: true } }, leaveType: true },
            orderBy: [{ year: 'desc' }, { employeeId: 'asc' }]
        });
        res.status(200).json({ success: true, quotas });
    } catch (error) { next(error); }
};

const createQuota = async (req, res, next) => {
    try {
        const { employeeId, leaveTypeId, year, totalDays } = req.body;
        const newQuota = await prisma.leaveQuota.create({
            data: { employeeId, leaveTypeId, year, totalDays: parseFloat(totalDays), usedDays: 0.00 }
        });
        res.status(201).json({ success: true, message: 'Quota assigned.', quota: newQuota });
    } catch (error) { next(error); }
};

const updateQuota = async (req, res, next) => {
    try {
        const updatedQuota = await prisma.leaveQuota.update({
            where: { quotaId: parseInt(req.params.quotaId) },
            data: { totalDays: parseFloat(req.body.totalDays) },
        });
        res.status(200).json({ success: true, message: 'Quota updated.', quota: updatedQuota });
    } catch (error) {
        if (error.code === 'P2025') { return next(CustomError.notFound(`Quota ID ${req.params.quotaId} not found.`)); }
        next(error);
    }
};

// --- Holiday Management (CRUD) ---
const getHolidays = async (req, res, next) => {
    try {
        const holidays = await prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } });
        res.status(200).json({ success: true, holidays });
    } catch (error) { next(error); }
};

const createHoliday = async (req, res, next) => {
    try {
        const { holidayDate, holidayName } = req.body;
        const newHoliday = await prisma.holiday.create({ data: { holidayDate: new Date(holidayDate), holidayName } });
        res.status(201).json({ success: true, message: 'Holiday created.', holiday: newHoliday });
    } catch (error) { next(error); }
};

const deleteHoliday = async (req, res, next) => {
    try {
        await prisma.holiday.delete({ where: { holidayId: parseInt(req.params.holidayId) } });
        res.status(200).json({ success: true, message: 'Holiday deleted successfully.' });
    } catch (error) {
        if (error.code === 'P2025') { return next(CustomError.notFound(`Holiday ID ${req.params.holidayId} not found.`)); }
        next(error);
    }
};

// 🆕 ฟังก์ชันใหม่: Sync โควต้ามาตรฐานให้พนักงานทุกคน
const syncAllEmployeesQuota = async (req, res, next) => {
    try {
        const year = new Date().getFullYear();
        
        // 1. ดึงพนักงานที่ Active ทั้งหมด และประเภทการลาทั้งหมด
        const [employees, leaveTypes] = await Promise.all([
            prisma.employee.findMany({ where: { isActive: true }, select: { employeeId: true } }),
            prisma.leaveType.findMany()
        ]);

        // 2. ใช้ Transaction วนลูปสร้าง/อัปเดตโควต้า (Upsert)
        const operations = [];
        for (const emp of employees) {
            for (const type of leaveTypes) {
                operations.push(
                    prisma.leaveQuota.upsert({
                        where: {
                            employeeId_leaveTypeId_year: {
                                employeeId: emp.employeeId,
                                leaveTypeId: type.leaveTypeId,
                                year: year
                            }
                        },
                        update: { totalDays: type.defaultDays }, // อัปเดตตามค่า Default
                        create: {
                            employeeId: emp.employeeId,
                            leaveTypeId: type.leaveTypeId,
                            year: year,
                            totalDays: type.defaultDays,
                            usedDays: 0
                        }
                    })
                );
            }
        }

        await prisma.$transaction(operations);
        res.status(200).json({ success: true, message: "Synced all employees with default quotas." });
    } catch (error) { next(error); }
};

const processYearEndCarryForward = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;

        // 1. ดึงประเภทการลาที่มีนโยบาย "ทบยอดได้"
        const carryForwardTypes = await prisma.leaveType.findMany({
            where: { canCarryForward: true }
        });

        if (carryForwardTypes.length === 0) {
            return res.status(200).json({ success: true, message: "No leave types configured for carry forward." });
        }

        // 2. ดึงพนักงานทั้งหมดที่ยังทำงานอยู่
        const employees = await prisma.employee.findMany({
            where: { isActive: true },
            select: { employeeId: true }
        });

        const operations = [];

        for (const emp of employees) {
            for (const type of carryForwardTypes) {
                // 3. หายอดคงเหลือของปีปัจจุบัน (Current Year)
                const currentQuota = await prisma.leaveQuota.findUnique({
                    where: {
                        employeeId_leaveTypeId_year: {
                            employeeId: emp.employeeId,
                            leaveTypeId: type.leaveTypeId,
                            year: currentYear
                        }
                    }
                });

                let carryAmount = 0;
                if (currentQuota) {
                    const remaining = currentQuota.totalDays - currentQuota.usedDays;
                    // ทบได้ไม่เกินที่นโยบายกำหนด (maxCarryDays) และไม่ติดลบ
                    carryAmount = Math.max(0, Math.min(remaining, type.maxCarryDays));
                }

                // 4. เตรียม Upsert เข้าปีหน้า (Next Year)
                // เราจะเอา defaultDays ของปีหน้า + carryAmount ที่ทบมา
                operations.push(
                    prisma.leaveQuota.upsert({
                        where: {
                            employeeId_leaveTypeId_year: {
                                employeeId: emp.employeeId,
                                leaveTypeId: type.leaveTypeId,
                                year: nextYear
                            }
                        },
                        update: {
                            carriedOverDays: carryAmount,
                            // ❌ ห้ามเอา carryAmount ไปบวกเพิ่มใน totalDays
                            totalDays: type.defaultDays 
                        },
                        create: {
                            employeeId: emp.employeeId,
                            leaveTypeId: type.leaveTypeId,
                            year: nextYear,
                            carriedOverDays: carryAmount,
                            totalDays: type.defaultDays, // ✅ เก็บแค่ค่ามาตรฐาน
                            usedDays: 0
                        }
                    })
                );
            }
        }

        // รัน Transaction ทั้งหมด
        await prisma.$transaction(operations);

        res.status(200).json({ 
            success: true, 
            message: `Successfully processed carry forward from ${currentYear} to ${nextYear}.` 
        });
    } catch (error) {
        next(error);
    }
};

// 1. เพิ่มพนักงานใหม่โดย HR
const createEmployee = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName, joiningDate, role } = req.body;
        const existing = await prisma.employee.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ success: false, message: "Email is already in use." });

        const passwordHash = await bcrypt.hash(password, 10);
        const year = new Date().getFullYear();

        // ใช้ Transaction: สร้างพนักงาน + แจกโควต้ามาตรฐาน
        const result = await prisma.$transaction(async (tx) => {
            const newEmp = await tx.employee.create({
                data: { email, passwordHash, firstName, lastName, role: role || 'Worker', joiningDate: new Date(joiningDate), isActive: true }
            });

            const leaveTypes = await tx.leaveType.findMany();
            const quotas = leaveTypes.map(type => ({
                employeeId: newEmp.employeeId,
                leaveTypeId: type.leaveTypeId,
                year: year,
                totalDays: type.defaultDays,
                usedDays: 0
            }));

            await tx.leaveQuota.createMany({ data: quotas });
            return newEmp;
        });

        res.status(201).json({ success: true, message: "Employee created and quotas assigned.", employee: result });
    } catch (error) { next(error); }
};

// 2. แก้ไขข้อมูลพนักงานโดย HR (ไม่จำเป็นต้องระบุรหัสผ่านเดิม)
const updateEmployeeByAdmin = async (req, res, next) => {
    try {
        const employeeId = parseInt(req.params.employeeId);
        const { firstName, lastName, email, role, isActive, password } = req.body;

        let updateData = {
            firstName,
            lastName,
            email,
            role,
            isActive: Boolean(isActive)
        };

        // หากมีการระบุรหัสผ่านใหม่เข้ามา (HR เปลี่ยนรหัสให้พนักงาน)
        if (password && password.trim() !== "") {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        const updated = await prisma.employee.update({
            where: { employeeId },
            data: updateData
        });

        res.status(200).json({ success: true, message: "Employee updated successfully", employee: updated });
    } catch (error) { next(error); }
};

// เพิ่มไว้ท้ายไฟล์ก่อน module.exports
const getAttendancePolicy = async (req, res, next) => {
    try {
        let policy = await prisma.attendancePolicy.findFirst();
        
        // 🔥 ถ้าใน DB ยังไม่มีข้อมูลเลย ให้สร้างอันแรกขึ้นมาด้วยค่า Default
        if (!policy) {
            policy = await prisma.attendancePolicy.create({
                data: {
                    policyId: 1,
                    startTime: "09:00",
                    endTime: "18:00",
                    graceMinutes: 5,
                    workingDays: "mon,tue,wed,thu,fri"
                }
            });
        }
        res.status(200).json({ success: true, policy });
    } catch (error) {
        // ถ้าเข้าตรงนี้แสดงว่าต่อ DB ไม่ติดจริงๆ ให้เช็ค .env
        console.error("DB Connection Error:", error);
        next(error);
    }
};

const updateAttendancePolicy = async (req, res, next) => {
    try {
        const { startTime, endTime, graceMinutes, workingDays } = req.body;
        const policy = await prisma.attendancePolicy.upsert({
            where: { policyId: 1 },
            update: { startTime, endTime, graceMinutes, workingDays },
            create: { policyId: 1, startTime, endTime, graceMinutes, workingDays }
        });
        res.status(200).json({ success: true, message: "Policy updated", policy });
    } catch (error) { next(error); }
};

module.exports = { 
    getAllEmployees, getEmployeeQuota, updateEmployeeQuotaBulk, // 🆕 เพิ่ม 3 ตัวนี้
    getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType, 
    getQuotas, createQuota, updateQuota, 
    getHolidays, createHoliday, deleteHoliday,
    syncAllEmployeesQuota, processYearEndCarryForward, createEmployee, updateEmployeeByAdmin, 
    getAttendancePolicy, updateAttendancePolicy
};