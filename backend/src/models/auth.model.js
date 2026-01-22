// backend/src/models/auth.model.js

const prisma = require('./prisma');
const CustomError = require('../utils/customError');

/**
 * Creates a new Employee record in the database.
 * @param {object} data - Employee data including email, passwordHash, firstName, lastName, joiningDate.
 * @returns {object} The newly created Employee record (excluding passwordHash).
 */
const registerEmployee = async (data) => {
    try {
        const employee = await prisma.employee.create({
            data: {
                ...data,
                // ค่าเริ่มต้น role='Worker' ถูกกำหนดใน schema.prisma
            },
            select: {
                employeeId: true,
                firstName: true,
                lastName: true,
                email: true,
                role: { select: { roleName: true } },
                joiningDate: true,
            },
        });
        // Flatten role for consistency if possible, or handle in controller. 
        // Returning as is: { ... role: { roleName: '...' } }
        return { ...employee, role: employee.role?.roleName };
    } catch (error) {
        // ถ้าเกิด Error อื่นๆ ที่ไม่เกี่ยวกับ P2002 (Unique) ให้โยน CustomError
        if (error.code !== 'P2002') {
            throw CustomError.badRequest("Registration failed due to invalid data.");
        }
        throw error; // ให้ error.middleware จัดการ P2002
    }
};

/**
 * Finds an employee by email address.
 * @param {string} email - Employee email.
 * @returns {object | null} The Employee record (including passwordHash) or null.
 */
const findEmployeeByEmail = async (email) => {
    const employee = await prisma.employee.findUnique({
        where: { email },
        // ต้อง include passwordHash สำหรับการตรวจสอบ Login
        select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            email: true,
            passwordHash: true,
            role: { select: { roleName: true } },
            isActive: true, // ตรวจสอบสถานะการใช้งาน
        }
    });
    if (employee) {
        return { ...employee, role: employee.role?.roleName };
    }
    return null;
};

module.exports = {
    registerEmployee,
    findEmployeeByEmail,
};