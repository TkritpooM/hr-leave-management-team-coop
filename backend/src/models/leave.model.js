// backend/src/models/leave.model.js

const prisma = require('./prisma');

/**
 * Creates a new leave request.
 */
const createLeaveRequest = async (data) => {
    return prisma.leaveRequest.create({
        data: {
            ...data,
            // มั่นใจว่า ID ทุกตัวเป็นเลข
            employeeId: parseInt(data.employeeId),
            leaveTypeId: parseInt(data.leaveTypeId)
        },
    });
};

/**
 * Retrieves a single leave request by ID with relations.
 */
const getLeaveRequestById = async (requestId) => {
    const id = parseInt(requestId);
    if (isNaN(id)) return null;

    return prisma.leaveRequest.findUnique({
        where: { requestId: id },
        include: {
            employee: { select: { employeeId: true, firstName: true, lastName: true, role: true } },
            leaveType: true,
            approvedByHR: { select: { employeeId: true, firstName: true, lastName: true } }
        }
    });
};

/**
 * Updates the status of a leave request (used in $transaction).
 */
const updateRequestStatusTx = async (requestId, status, hrId, tx) => {
    const id = parseInt(requestId);
    return tx.leaveRequest.update({
        where: { requestId: id },
        data: {
            status: status,
            approvedByHrId: parseInt(hrId),
            approvalDate: new Date(),
        },
        select: {
            requestId: true,
            employeeId: true,
            leaveTypeId: true,
            status: true,
        }
    });
};

module.exports = {
    createLeaveRequest,
    getLeaveRequestById,
    updateRequestStatusTx,
};