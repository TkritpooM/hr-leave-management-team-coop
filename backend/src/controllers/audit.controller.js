const prisma = require("../models/prisma");

exports.getAuditLogs = async (req, res, next) => {
  try {
    const {
      q = "",
      category = "All", // (optional) ฝั่ง FE จะส่งมาเป็น Leave/Attendance/...
      action = "",      // (optional) เช่น CHECKIN, LEAVE_REQUEST_APPROVE
      page = "1",
      pageSize = "20",
      dateFrom = "",    // YYYY-MM-DD
      dateTo = "",      // YYYY-MM-DD
    } = req.query;

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 5), 100);
    const skip = (p - 1) * ps;

    const kw = String(q || "").trim();

    // helper: map category -> where action
    const categoryToActionWhere = (cat) => {
      if (!cat || cat === "All") return {};
      if (cat === "Leave") return { action: { startsWith: "LEAVE_" } };
      if (cat === "Attendance") return { action: { startsWith: "CHECK" } };
      if (cat === "Quota") return { action: { contains: "QUOTA" } };
      if (cat === "Holiday") return { action: { contains: "HOLIDAY" } };
      if (cat === "Policy") return { action: { contains: "POLICY" } };
      if (cat === "Employee") return { action: { startsWith: "EMPLOYEE" } };
      if (cat === "Notification") return { action: { startsWith: "NOTIFICATION" } };
      if (cat === "Auth") return { action: { in: ["LOGIN_SUCCESS", "REGISTER"] } };
      if (cat === "Report") return { action: { startsWith: "EXPORT" } };
      return {};
    };

    const where = {
      ...categoryToActionWhere(category),
      ...(action ? { action } : {}),
      ...(dateFrom || dateTo
        ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
          },
        }
        : {}),
      ...(kw
        ? {
          OR: [
            { action: { contains: kw } },
            { entity: { contains: kw } },
            { entityKey: { contains: kw } },
            { ipAddress: { contains: kw } },
            {
              performer: {
                OR: [
                  { firstName: { contains: kw } },
                  { lastName: { contains: kw } },
                  { email: { contains: kw } },
                ],
              },
            },
          ],
        }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: ps,
        include: {
          performer: {
            select: {
              employeeId: true,
              firstName: true,
              lastName: true,
              email: true,
              role: { select: { roleName: true } },
            },
          },
        },
      }),
    ]);

    const flatRows = rows.map(r => ({
      ...r,
      performer: r.performer ? { ...r.performer, role: r.performer.role?.roleName } : null
    }));

    res.json({
      success: true,
      total,
      page: p,
      pageSize: ps,
      rows: flatRows,
    });
  } catch (err) {
    next(err);
  }
};
