export const STOCK_CATEGORY_RULES: Record<string, string[]> = {
  FABRIC: ["MAIN", "SHEER", "SOFA", "LINING"],
  HARDWARE: ["ROD", "CHANNEL"],
  HARDWARE_ACCESSORIES: ["ACCESSORIES"],
  SERVICE: ["STITCHING", "INSTALLATION"],
  LINEN: ["CARPET", "BEDSHEET", "CUSHION COVER", "MATE", "FILLER", "PILLOW","BALNKET","BED COVER", "TOWEL SET"],
  "FOAM & LOOSE MATERIAL": ["FOAM", "LOOSE MATERIAL"],
  WALLPAPER: ["WALLPAPER"],
  HANDMADE_ACCESSORIESE: ["HANDMADE ACCESSORIES"],
};

const normalizeKey = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CATEGORY_NORMALIZED_MAP = Object.keys(STOCK_CATEGORY_RULES).reduce<Record<string, string>>(
  (acc, key) => {
    acc[normalizeKey(key)] = key;
    return acc;
  },
  {
    "HARDWARE ACCESSORIESE": "HARDWARE_ACCESSORIES",
    "HARDWARE ACCESSORIES": "HARDWARE_ACCESSORIES",
    "HARDWARE ACCESSORY": "HARDWARE_ACCESSORIES",
    "FOAM LOOSE MATERIAL": "FOAM & LOOSE MATERIAL",
    "FOAM LOOSEMATERIAL": "FOAM & LOOSE MATERIAL",
    "wallpaper": "WALLPAPER",
    "HANDMADE ACCESSORIESE": "HANDMADE_ACCESSORIESE",
  }
);

export const getStockCategoryOptions = () => Object.keys(STOCK_CATEGORY_RULES);

export const getStockSubcategories = (category?: string) => {
  const resolved = resolveStockCategory(category);
  if (!resolved) return [];
  return STOCK_CATEGORY_RULES[resolved] || [];
};

export const resolveStockCategory = (value?: string) => {
  const normalized = normalizeKey(value || "");
  if (!normalized) return undefined;
  return CATEGORY_NORMALIZED_MAP[normalized];
};

export const resolveStockCategoryGroup = (
  value: string | undefined,
  category: string | undefined
) => {
  const group = normalizeKey(value || "");
  if (!group) return undefined;
  const resolvedCategory = resolveStockCategory(category);
  if (!resolvedCategory) return undefined;
  const allowed = (STOCK_CATEGORY_RULES[resolvedCategory] || []).map((item) => normalizeKey(item));
  if (allowed.length === 0) return group;
  return allowed.includes(group) ? group : undefined;
};
