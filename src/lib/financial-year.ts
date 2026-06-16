const toDate = (value?: string | number | Date | null) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value !== undefined && value !== null && value !== "") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export const getFinancialYearLabel = (value?: string | number | Date | null) => {
  const date = toDate(value);
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
};

export const getMoDesignsCompanyName = (value?: string | number | Date | null) =>
  `MO Designs Private Limited - (${getFinancialYearLabel(value)})`;

export const normalizeCompanyFinancialYear = (
  companyName: string,
  value?: string | number | Date | null
) => {
  if (!/mo designs private limited/i.test(companyName)) return companyName;
  const baseName = companyName.replace(/\s*-\s*\(\d{4}-\d{4}\)\s*$/, "").trim();
  return `${baseName} - (${getFinancialYearLabel(value)})`;
};
