const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Start updating permissions...");

    // 1. Create or Find 'manage_employee_data' permission
    const permName = 'manage_employee_data';
    const permDesc = 'Create, Edit, Delete Employee Data';

    let perm = await prisma.permission.findUnique({ where: { name: permName } });

    if (!perm) {
        perm = await prisma.permission.create({
            data: { name: permName, description: permDesc }
        });
        console.log(`Created permission: ${permName}`);
    } else {
        console.log(`Permission ${permName} already exists.`);
    }

    // 2. Assign to HR
    const hrRole = await prisma.role.findUnique({
        where: { roleName: 'HR' },
        include: { permissions: true }
    });

    if (hrRole) {
        const hasIt = hrRole.permissions.some(p => p.permissionId === perm.permissionId);
        if (!hasIt) {
            await prisma.role.update({
                where: { roleId: hrRole.roleId },
                data: {
                    permissions: {
                        connect: { permissionId: perm.permissionId }
                    }
                }
            });
            console.log(`Assigned ${permName} to HR role.`);
        } else {
            console.log(`HR role already has ${permName}.`);
        }
    } else {
        console.error("HR role not found!");
    }

    // 3. Assign to Admin (Optional, usually Admin bypasses checks, but good for consistency)
    const adminRole = await prisma.role.findUnique({
        where: { roleName: 'Admin' },
        include: { permissions: true }
    });

    if (adminRole) {
        const hasIt = adminRole.permissions.some(p => p.permissionId === perm.permissionId);
        if (!hasIt) {
            await prisma.role.update({
                where: { roleId: adminRole.roleId },
                data: {
                    permissions: {
                        connect: { permissionId: perm.permissionId }
                    }
                }
            });
            console.log(`Assigned ${permName} to Admin role.`);
        }
    }

    console.log("Permission update complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
