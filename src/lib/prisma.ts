import { PrismaClient } from '@prisma/client';

// Evita múltiplas conexões em ambiente de desenvolvimento (Hot Reload)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;