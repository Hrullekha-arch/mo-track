export const normalizePmsItemKey = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const PMS_EXCLUDED_ITEM_VALUES = [
  "wallpaper-laying-charges",
  "installation",
  "installatation-charges",
  "sofa-stitching-charges",
  "loose-material",
  "ac-fold-stitching-charges",
  "bedhead-stitching-charges",
  "blind-repairing-charges",
  "blind-stitching-charges-reg",
  "bolster-cover-stitching-charges",
  "curtain-alteration-charge",
  "curtain-stitching-charges",
  "eyelet-curtain-sttiching-charges",
  "channel-installation-charges",
  "nefa-curtain-stitching-charges",
  "blind-with-border-stitching-charges",
  "belt-stitching-charges",
  "cushion-cover-stitching-charges",
  "puffi-stitching-charge",
  "ripple-pleat-stitching-charges",
  "roman-blind-stitching-charge",
  "sofa-cover-stitching-charges",
  "stitching-charges",
  "valance-stitching-charges",
  "wall-panneling-charges",
  "dining-chair-stitching",
  "chair-stitching-charges",
  "sofa-combed-stitching-charges",
  "laying",
  "stitching-matterial",
  "couche-stitching-charges",
  "loose-cover-stitching-charges",
  "motorized-channel-installation-charges",
  "sofa-cushion-stitching-charges",
  "stitching-material",
];

export const PMS_EXCLUDED_ITEM_KEYS = new Set(
  PMS_EXCLUDED_ITEM_VALUES.map((value) => normalizePmsItemKey(value))
);

export const isPmsExcludedItem = (...values: Array<unknown>) =>
  values.some((value) => PMS_EXCLUDED_ITEM_KEYS.has(normalizePmsItemKey(String(value ?? ""))));
