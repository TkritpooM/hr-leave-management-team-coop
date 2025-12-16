// backend/src/controllers/timeRecord.controller.js

const timeRecordService = require('../services/timeRecord.service');
const prisma = require('../models/prisma');

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
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');
        
        const lateRecords = await prisma.timeRecord.findMany({
            where: {
                employeeId,
                isLate: true,
                workDate: {
                    gte: new Date(startOfMonth),
                    lte: new Date(endOfMonth),
                }
            },
            select: { recordId: true } // ดึงแค่ ID เพื่อลด Payload
        });

        const lateCount = lateRecords.length;
        
        // HR อาจกำหนด Limit การมาสาย (Mocking Limit ที่ 5)
        const lateLimit = 5; 

        res.status(200).json({ success: true, lateCount, lateLimit, isExceeded: lateCount > lateLimit });
    } catch (error) { next(error); }
};

module.exports = { handleCheckIn, handleCheckOut, getMyTimeRecords, getAllTimeRecords,getMonthlyLateSummary };