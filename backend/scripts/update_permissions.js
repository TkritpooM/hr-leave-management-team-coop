const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('\n--- Updating Permissions Only ---');

    // 1. รายชื่อ Permissions ใหม่ที่ต้องการเพิ่ม
    const targetPermissions = [
        { name: 'manage_employees', description: 'Create, Edit, Delete Employees' },
        { name: 'manage_leave_settings', description: 'Create, Edit Leave Types and Quotas' },
        { name: 'manage_attendance_policy', description: 'Update Attendance Policy and Holidays' },
        { name: 'access_audit_log', description: 'View Audit Logs' }
    ];

    const permMap = {};

    // 2. วนลูปสร้างหรืออัปเดต Permissions (Upsert)
    for (const p of targetPermissions) {
        const perm = await prisma.permission.upsert({
            where: { name: p.name },
            update: { description: p.description }, // ถ้ามีแล้ว อัปเดต description
            create: p, // ถ้ายังไม่มี สร้างใหม่
        });
        console.log(`✅ Verified Permission: ${p.name}`);
        permMap[p.name] = perm.permissionId;
    }

    // 3. กำหนดว่าจะให้ Role ไหนได้สิทธิ์อะไรบ้าง
    const roleUpdates = [
        {
            roleName: 'HR',
            addPerms: [
                'manage_employees',
                'manage_leave_settings',
                'manage_attendance_policy',
                'access_audit_log'
            ]
        },
        {
            roleName: 'Admin',
            addPerms: [
                'manage_employees',
                'manage_leave_settings',
                'manage_attendance_policy',
                'access_audit_log'
            ]
        }
    ];

    // 4. อัปเดต Role
    for (const r of roleUpdates) {
        const role = await prisma.role.findFirst({ where: { roleName: r.roleName } });

        if (role) {
            // แปลงชื่อ perm เป็น id
            const connectPayload = r.addPerms
                .map(name => ({ permissionId: permMap[name] }))
                .filter(obj => obj.permissionId); // กรองตัวที่ไม่มี id ออก (เผื่อพลาด)

            if (connectPayload.length > 0) {
                await prisma.role.update({
                    where: { roleId: role.roleId },
                    data: {
                        permissions: {
                            connect: connectPayload // connect จะเพิ่มเข้าไป ไม่ลบของเก่า
                        }
                    }
                });
                console.log(`✅ Updated Role "${r.roleName}" with new permissions.`);
            }
        } else {
            console.log(`⚠️ Role "${r.roleName}" not found.`);
        }
    }

    console.log('--- Update Finished (No data deleted) ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
