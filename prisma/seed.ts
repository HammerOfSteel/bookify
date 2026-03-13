import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role },
  });
}

async function main() {
  await upsertUser("Bookify Admin", "admin@bookify.com", "admin123", UserRole.ADMIN);
  await upsertUser("Bookify User", "user@bookify.com", "user123", UserRole.USER);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
