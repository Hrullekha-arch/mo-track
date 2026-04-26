const normalizeCategory = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeProcess = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const isPmsCategoryMatch = (
  productCategory?: string,
  skillCategory?: string
) => {
  const productKey = normalizeCategory(productCategory);
  const skillKey = normalizeCategory(skillCategory);

  if (!productKey || !skillKey) return true;
  if (productKey === skillKey) return true;
  return productKey.includes(skillKey) || skillKey.includes(productKey);
};

export const isUniversalPmsProcess = (process?: string) =>
  normalizeProcess(process) === "stitching";

export const isPmsSkillEligible = ({
  process,
  productCategory,
  skillCategory,
}: {
  process?: string;
  productCategory?: string;
  skillCategory?: string;
}) => {
  if (isUniversalPmsProcess(process)) return true;
  return isPmsCategoryMatch(productCategory, skillCategory);
};
