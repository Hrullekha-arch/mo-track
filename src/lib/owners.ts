import { OwnerType } from "./types";

export const ownerTypeFromUser = (role?: string, designation?: string): OwnerType => {
  const roleNorm = (role || "").toLowerCase();
  const desigNorm = (designation || "").toLowerCase();
  if (roleNorm === "salesman") return "SALESMAN";
  if (roleNorm === "accounts") return "ACCOUNT";
  if (desigNorm === "allocators") return "ALLOCATOR";
  return "CRM";
};
