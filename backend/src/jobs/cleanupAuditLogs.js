const prisma = require('../models/prisma');

/**
 * Cleanup old audit logs based on retention period.
 * Default retention is 90 days if not specified in env.
 */
async function cleanupOldAuditLogs() {
    try {
        const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);

        // Safety check: Don't allow extremely short retention by accident (msg if < 7 days)
        if (retentionDays < 1) {
            console.warn('Audit Log Cleanup: Retention days is set to less than 1. Skipping cleanup to prevent data loss.');
            return;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        console.log(`Audit Log Cleanup: Starting cleanup for logs older than ${retentionDays} days (before ${cutoffDate.toISOString()})...`);

        const deleted = await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: cutoffDate,
                },
            },
        });

        if (deleted.count > 0) {
            console.log(`Audit Log Cleanup: Successfully deleted ${deleted.count} old audit log records.`);
        } else {
            console.log('Audit Log Cleanup: No old records found to delete.');
        }
    } catch (error) {
        console.error('Audit Log Cleanup: Error occurred while cleaning up old logs:', error);
    }
}

/**
 * Starts the daily cleanup job.
 * Runs immediately on server start (non-blocking), then every 24 hours.
 */
function startAuditLogCleanupJob() {
    // Run once on startup (with a small delay to let server settle)
    setTimeout(() => {
        cleanupOldAuditLogs();
    }, 1000 * 60 * 1); // Run 1 minute after server start

    // Schedule to run every 24 hours
    // 24 hours * 60 mins * 60 secs * 1000 ms
    const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

    setInterval(() => {
        cleanupOldAuditLogs();
    }, DAILY_INTERVAL);

    console.log('Audit Log Cleanup: Job scheduled (Frequency: Daily)');
}

module.exports = { startAuditLogCleanupJob, cleanupOldAuditLogs };
