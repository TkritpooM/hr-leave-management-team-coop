// backend/src/routes/leaveRequest.route.js

const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leave.controller');

// Debug: แสดง key ที่ controller ส่งออกมา (ลบได้หลังแก้เสร็จ)
console.log('leaveController keys:', Object.keys(leaveController || {}));

function ensureHandler(fn, name) {
  if (typeof fn !== 'function') {
    throw new TypeError(`Route handler "${name}" is not a function. Check controller export or remove parentheses when passing handler.`);
  }
  return fn;
}

// กำหนด routes — ใช้ฟังก์ชันเป็น reference (ไม่ใส่วงเล็บ)
router.get('/', ensureHandler(leaveController.getAllRequests, 'getAllRequests'));
router.post('/', ensureHandler(leaveController.createLeaveRequest, 'createLeaveRequest'));
router.get('/:id', ensureHandler(leaveController.getLeaveById, 'getLeaveById'));
router.put('/:id', ensureHandler(leaveController.updateLeaveRequest, 'updateLeaveRequest'));
router.delete('/:id', ensureHandler(leaveController.deleteLeaveRequest, 'deleteLeaveRequest'));

module.exports = router;