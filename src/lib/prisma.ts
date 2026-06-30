/**
 * Placeholder Prisma client wrapper.
 * Replace this object with a real PrismaClient import after
 * `prisma` and `@prisma/client` are installed in the project.
 */
type PrismaPlaceholder = {
  connected: boolean;
  mode: "placeholder";
};

declare global {
  // eslint-disable-next-line no-var
  var __productionFpmsPrisma__: PrismaPlaceholder | undefined;
}

const prisma = globalThis.__productionFpmsPrisma__ ?? {
  connected: false,
  mode: "placeholder" as const,
};

if (process.env.NODE_ENV !== "production") {
  globalThis.__productionFpmsPrisma__ = prisma;
}

export { prisma };
export default prisma;
