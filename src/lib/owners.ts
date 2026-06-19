import { OwnerType } from "./types";
import { isAllocatorDesignation } from "./user-access";

export const ownerTypeFromUser = (role?: string, designation?: string): OwnerType => {
  const roleNorm = (role || "").toLowerCase();
  if (roleNorm === "salesman") return "SALESMAN";
  if (roleNorm === "accounts") return "ACCOUNT";
  if (isAllocatorDesignation(designation)) return "ALLOCATOR";
  return "CRM";
};
