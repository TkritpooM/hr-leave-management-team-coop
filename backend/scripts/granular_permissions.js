const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Start granularizing permissions...");

    // Define new permissions
    const newPermissions = [
        { name: 'manage_leave_configuration', description: 'Create, Edit, Delete Leave Types and Quotas' },
        { name: 'manage_attendance_configuration', description: 'Edit Attendance Policies and Holidays' }
    ];

    for (const perm of newPermissions) {
        let existing = await prisma.permission.findUnique({ where: { name: perm.name } });

        if (!existing) {
            existing = await prisma.permission.create({
                data: { name: perm.name, description: perm.description }
            });
            console.log(`Created permission: ${perm.name}`);
        } else {
            console.log(`Permission ${perm.name} already exists.`);
        }

        // Assign to HR
        const hrRole = await prisma.role.findUnique({
            where: { roleName: 'HR' },
            include: { permissions: true }
        });

        if (hrRole) {
            const hasIt = hrRole.permissions.some(p => p.permissionId === existing.permissionId);
            if (!hasIt) {
                await prisma.role.update({
                    where: { roleId: hrRole.roleId },
                    data: {
                        permissions: {
                            connect: { permissionId: existing.permissionId }
                        }
                    }
                });
                console.log(`Assigned ${perm.name} to HR role.`);
            }
        }

        // Assign to Admin (Just in case)
        const adminRole = await prisma.role.findUnique({
            where: { roleName: 'Admin' },
            include: { permissions: true }
        });

        if (adminRole) {
            const hasIt = adminRole.permissions.some(p => p.permissionId === existing.permissionId);
            if (!hasIt) {
                await prisma.role.update({
                    where: { roleId: adminRole.roleId },
                    data: {
                        permissions: {
                            connect: { permissionId: existing.permissionId }
                        }
                    }
                });
                console.log(`Assigned ${perm.name} to Admin role.`);
            }
        }
    }

    console.log("Granular permission update complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
