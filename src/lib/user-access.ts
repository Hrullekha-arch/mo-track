type AccessUser = {
  role?: unknown;
  designation?: unknown;
  isActive?: boolean;
};

const normalizeAccessValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

export const isAllocatorDesignation = (designation: unknown) => {
  const normalizedDesignation = normalizeAccessValue(designation);
  return (
    normalizedDesignation === "allocator" ||
    normalizedDesignation === "allocators" ||
    normalizedDesignation === "allocater"
  );
};

export const canAllocateOrders = (user: AccessUser | null | undefined) => {
  if (!user || user.isActive === false) return false;

  const normalizedRole = normalizeAccessValue(user.role);
  const normalizedDesignation = normalizeAccessValue(user.designation);
  return (
    normalizedRole === "admin" ||
    normalizedRole === "pc" ||
    normalizedDesignation === "ea" ||
    isAllocatorDesignation(user.designation)
  );
};
