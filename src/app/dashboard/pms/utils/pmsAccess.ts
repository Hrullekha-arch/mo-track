import type { UserRole } from "@/lib/types";

export const PMS_AUTHORIZED_ROLES: UserRole[] = ["admin", "employee"];

export const canAccessPms = (role?: UserRole | null) =>
  Boolean(role && PMS_AUTHORIZED_ROLES.includes(role));

export const canManagePms = canAccessPms;
