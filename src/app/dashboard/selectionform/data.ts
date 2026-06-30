// ─── Design Tokens ────────────────────────────────────────────────────────────
export const GOLD = "#C9A84C";
export const GOLD_L = "#E8C97A";
export const DARK = "#1A1208";
export const DARK_MID = "#2E2210";
export const CHARCOAL = "#3D3228";
export const WARM = "#6B5F52";
export const BORDER = "rgba(201,168,76,0.25)";
export const BORDER_S = "rgba(201,168,76,0.55)";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Product = { name: string; cat: string; tag?: string };
export type Room = { id: string; label: string; keywords: string[]; products: Product[] };
export type PastVisit = { name: string; mobile: string; lookingFor?: string | string[]; status?: string; store?: string };

// ─── Rooms ────────────────────────────────────────────────────────────────────
export const ROOMS: Room[] = [
  {
    id: "living", label: "Living Room",
    keywords: ["sofa", "living", "hall", "couch", "recliner", "tv", "center table", "ottoman", "lounge"],
    products: [
      { name: "Sofa / Seating Set", cat: "Furniture", tag: "Bestseller" },
      { name: "Sofa Fabric (re-upholstery)", cat: "Fabric" },
      { name: "L-Shape / Sectional Sofa", cat: "Furniture", tag: "Premium" },
      { name: "Sofa Foam / Cushion Foam", cat: "Foam" },
      { name: "Recliner Sofa", cat: "Furniture", tag: "Popular" },
      { name: "Coffee Table / Center Table", cat: "Furniture" },
      { name: "TV Entertainment Unit", cat: "Furniture" },
      { name: "Ottoman / Pouffe", cat: "Furniture" },
      { name: "Curtain Fabric", cat: "Curtains" },
      { name: "Custom Curtains (stitched)", cat: "Curtains" },
      { name: "Carpet / Area Rug", cat: "Flooring" },
      { name: "Cushion Covers", cat: "Soft Furnish" },
      { name: "Sheer Fabric", cat: "Curtains" },
      { name: "Blinds", cat: "Window" },
      { name: "Door Mat", cat: "Flooring" },
      { name: "Bookshelf", cat: "Furniture" },
    ],
  },
  {
    id: "master_bed", label: "Master Bedroom",
    keywords: ["bed", "bedroom", "master", "wardrobe", "almirah", "dresser", "mattress"],
    products: [
      { name: "King Bed with Storage", cat: "Furniture", tag: "Premium" },
      { name: "Mattress Foam", cat: "Foam" },
      { name: "Wardrobe (2/3-door / Sliding)", cat: "Furniture" },
      { name: "Mattress Protector", cat: "Linen" },
      { name: "Dresser with Mirror", cat: "Furniture" },
      { name: "Bed Cover / Bedspread", cat: "Linen", tag: "Popular" },
      { name: "Bedside Table (pair)", cat: "Furniture" },
      { name: "Bedsheet — Double / King", cat: "Linen" },
      { name: "Premium Mattress", cat: "Foam" },
      { name: "Pillow Covers", cat: "Linen" },
      { name: "Quilt / Comforter", cat: "Linen" },
      { name: "Curtain Fabric", cat: "Curtains" },
      { name: "Custom Curtains (stitched)", cat: "Curtains" },
      { name: "Carpet / Bedside Rug", cat: "Flooring" },
      { name: "Study Table", cat: "Furniture" },
      { name: "Dohar (light quilt)", cat: "Linen" },
    ],
  },
  {
    id: "guest_bed", label: "Guest Bedroom",
    keywords: ["guest", "kids", "children", "spare room", "second bed"],
    products: [
      { name: "Queen / Single Bed", cat: "Furniture" },
      { name: "Wardrobe (2-door)", cat: "Furniture" },
      { name: "Bedside Table", cat: "Furniture" },
      { name: "Mattress", cat: "Foam" },
      { name: "Bedsheet — Single / Double", cat: "Linen" },
      { name: "Pillow Covers", cat: "Linen" },
      { name: "Blanket / Dohar", cat: "Linen" },
      { name: "Curtain Fabric", cat: "Curtains" },
      { name: "Cushion Covers", cat: "Soft Furnish" },
    ],
  },
  {
    id: "dining", label: "Dining Area",
    keywords: ["dining", "kitchen", "table", "eat", "food", "crockery", "buffet", "sideboard"],
    products: [
      { name: "6-Seater Dining Set", cat: "Furniture", tag: "Bestseller" },
      { name: "4-Seater Dining Set", cat: "Furniture" },
      { name: "8-Seater Dining Table", cat: "Furniture", tag: "Premium" },
      { name: "Dining Chairs (set)", cat: "Furniture" },
      { name: "Crockery Unit", cat: "Furniture" },
      { name: "Table Cover / Tablecloth", cat: "Table Linen" },
      { name: "Table Mats / Placemats", cat: "Table Linen" },
      { name: "Curtain Fabric", cat: "Curtains" },
      { name: "Blinds", cat: "Window" },
      { name: "Carpet / Runner", cat: "Flooring" },
    ],
  },
  {
    id: "bathroom", label: "Bathroom",
    keywords: ["bath", "shower", "toilet", "washroom"],
    products: [
      { name: "Bath Towels", cat: "Bath Linen" },
      { name: "Hand Towels", cat: "Bath Linen" },
      { name: "Bath Mat", cat: "Bath Linen" },
      { name: "Shower Curtain", cat: "Curtains" },
      { name: "Soap Dispenser", cat: "Accessories" },
      { name: "Dustbin / Waste Bin", cat: "Accessories" },
    ],
  },
  {
    id: "office", label: "Office / Study",
    keywords: ["office", "study", "work", "desk", "executive", "meeting", "conference", "library"],
    products: [
      { name: "Executive Desk", cat: "Furniture", tag: "Premium" },
      { name: "Ergonomic Chair", cat: "Furniture", tag: "Popular" },
      { name: "Bookshelf / Bookcase", cat: "Furniture" },
      { name: "File Cabinet", cat: "Furniture" },
      { name: "Meeting Table", cat: "Furniture" },
      { name: "Computer Workstation", cat: "Furniture" },
      { name: "Curtain Fabric", cat: "Curtains" },
    ],
  },
  {
    id: "curtains", label: "Curtains & Drapes",
    keywords: ["curtain", "drape", "blind", "window treatment", "sheer", "pelmet", "track", "rod", "valance", "blackout", "roller blind", "zebra blind", "roman blind"],
    products: [
      { name: "Sheer / Net Fabric", cat: "Fabric Type" },
      { name: "Linen / Linen-look Fabric", cat: "Fabric Type", tag: "Popular" },
      { name: "Velvet Curtain Fabric", cat: "Fabric Type", tag: "Premium" },
      { name: "Blackout Lining Fabric", cat: "Fabric Type" },
      { name: "Silk / Satin Curtain Fabric", cat: "Fabric Type", tag: "Premium" },
      { name: "Printed / Woven Fabric", cat: "Fabric Type" },
      { name: "Embroidered Curtain Fabric", cat: "Fabric Type", tag: "Premium" },
      { name: "Blackout Lining (add-on)", cat: "Fabric Add-ons" },
      { name: "Thermal / Interlined Lining", cat: "Fabric Add-ons" },
      { name: "Interlining (body & drape)", cat: "Fabric Add-ons", tag: "Premium" },
      { name: "Buckram / Stiffener (header)", cat: "Fabric Add-ons" },
      { name: "Tassel & Fringe Trim", cat: "Fabric Add-ons", tag: "Popular" },
      { name: "Contrast Border / Edge Trim", cat: "Fabric Add-ons" },
      { name: "Velvet Border Trim", cat: "Fabric Add-ons", tag: "Premium" },
      { name: "Hand Embroidery Add-on", cat: "Fabric Add-ons", tag: "Premium" },
      { name: "Gold / Metallic Trim Tape", cat: "Fabric Add-ons" },
      { name: "Bottom Weight Chain", cat: "Fabric Add-ons" },
      { name: "Eyelet (Ring-top) Curtains", cat: "Stitching Style", tag: "Bestseller" },
      { name: "Pinch Pleat Curtains", cat: "Stitching Style" },
      { name: "Wave / S-Fold Curtains", cat: "Stitching Style", tag: "Popular" },
      { name: "Tab-top Curtains", cat: "Stitching Style" },
      { name: "Rod Pocket Curtains", cat: "Stitching Style" },
      { name: "Roller Blind", cat: "Blinds" },
      { name: "Zebra / Dual Blind", cat: "Blinds", tag: "Popular" },
      { name: "Roman Blind", cat: "Blinds", tag: "Premium" },
      { name: "Venetian Blind (Aluminium)", cat: "Blinds" },
      { name: "Wooden Blind", cat: "Blinds" },
      { name: "Roman Blind — Blackout Lining", cat: "Blind Add-ons" },
      { name: "Roman Blind — Motorised Lift", cat: "Blind Add-ons", tag: "Premium" },
      { name: "Roman Blind — Thermal Lining", cat: "Blind Add-ons" },
      { name: "Roman Blind — Cassette Headrail", cat: "Blind Add-ons" },
      { name: "Zebra Blind — Motorised", cat: "Blind Add-ons", tag: "Popular" },
      { name: "Zebra Blind — Blackout Backing", cat: "Blind Add-ons" },
      { name: "Zebra Blind — Day-Night Fabric Upgrade", cat: "Blind Add-ons" },
      { name: "Zebra Blind — Cassette / Headrail", cat: "Blind Add-ons" },
      { name: "Curtain Rod / Pole", cat: "Hardware" },
      { name: "Curtain Track (Ceiling / Wall)", cat: "Hardware" },
      { name: "Motorised Track System", cat: "Hardware", tag: "Premium" },
      { name: "Curtain Tiebacks / Holdbacks", cat: "Hardware" },
      { name: "Pelmet / Valance Box", cat: "Hardware" },
    ],
  },
  {
    id: "outdoor", label: "Outdoor / Balcony",
    keywords: ["outdoor", "garden", "balcony", "terrace", "patio", "poolside"],
    products: [
      { name: "Garden Sofa Set", cat: "Outdoor", tag: "Popular" },
      { name: "Rattan Furniture Set", cat: "Outdoor" },
      { name: "Folding Table & Chairs", cat: "Outdoor" },
      { name: "Swing / Lounger", cat: "Outdoor" },
      { name: "Outdoor Dining Set", cat: "Outdoor" },
      { name: "Umbrella Stand Set", cat: "Outdoor" },
    ],
  },
  {
    id: "full_home", label: "Full Home / Villa",
    keywords: ["full home", "entire", "complete", "flat", "apartment", "villa", "bungalow", "house", "renovation", "new home"],
    products: [
      { name: "Full Home Furniture Package", cat: "Package", tag: "Premium" },
      { name: "Modular Kitchen", cat: "Modular" },
      { name: "Modular Wardrobe", cat: "Modular" },
      { name: "Complete Linen Package", cat: "Linen" },
      { name: "Curtains — All Rooms", cat: "Curtains" },
      { name: "Carpets & Rugs", cat: "Flooring" },
      { name: "False Ceiling Design", cat: "Interior" },
      { name: "Cushion & Accent Package", cat: "Soft Furnish" },
    ],
  },
];

// ─── Form Options ─────────────────────────────────────────────────────────────
export const VISIT_PURPOSES = [
  { id: "new_home", label: "New Home", desc: "Brand new or ready property" },
  { id: "refresh", label: "Refresh Rooms", desc: "Updating specific spaces" },
  { id: "specific", label: "Specific Item(s)", desc: "One or two pieces" },
];

export const PALETTES = [
  { id: "neutral", label: "Neutral Serenity", desc: "Ivory · Linen · Taupe · Chalk", swatches: ["#F5F0E8", "#E8DCC8", "#C4B09A", "#EAE5D8"] },
  { id: "warm", label: "Warm Luxury", desc: "Camel · Antique Gold · Cognac", swatches: ["#C8956A", "#C9A84C", "#8B6548", "#E8C97A"] },
  { id: "cool", label: "Cool Elegance", desc: "Dove Grey · Steel Blue · Silver", swatches: ["#9BA8AF", "#6B8FA5", "#B0BCC5", "#D4DDE3"] },
  { id: "bold", label: "Bold Statement", desc: "Deep Wine · Forest Green · Navy", swatches: ["#722F37", "#2D5A3D", "#1A2744", "#8B3A4A"] },
];

export const STYLES = [
  { id: "modern", label: "Modern", desc: "Clean lines, understated, functional" },
  { id: "contemporary", label: "Contemporary", desc: "Current trends, mixed textures" },
  { id: "classic", label: "French Classic", desc: "Romantic, carved, soft tones" },
  { id: "luxury", label: "Royal Luxury", desc: "Opulent, rich, dramatic" },
  { id: "deco", label: "Art Deco", desc: "Geometric glamour, bold symmetry" },
  { id: "transitional", label: "Transitional", desc: "Classic meets contemporary" },
];

export const STYLE_NOTE: Record<string, string> = {
  modern: "Emphasise clean silhouettes and neutral palette. Avoid heavy ornamentation.",
  contemporary: "Highlight mixed textures and on-trend pieces. Show new arrivals first.",
  classic: "Lead with embroidered curtains, tassels, and carved wood details.",
  luxury: "Premium fabrics, metallic trims, velvet upholstery — no compromise.",
  deco: "Geometric patterns, brass or gold hardware, bold symmetry.",
  transitional: "Pair classic forms with contemporary finishes — versatile and timeless.",
};

export const DECOR_LEVELS = [
  { id: "1", label: "Very Calm", desc: "Materials speak quietly" },
  { id: "2", label: "Subtly Decorative", desc: "Tasteful, considered" },
  { id: "3", label: "Stylish", desc: "Confident statement" },
  { id: "4", label: "Maximally Rich", desc: "Every detail elevated" },
];

export const ACCENT_OPTIONS = [
  "Tassels & fringe trims",
  "Decorative contrast borders",
  "Hand embroidery on curtains",
  "Contrast piping on cushions",
  "Gold / metallic trims",
  "None — prefer clean finish",
];

export const PRIORITY_OPTIONS = ["Aesthetic beauty", "Comfort", "Durability", "Easy maintenance", "Luxury feel"];
export const TIMELINE_OPTIONS = ["Immediate (within 2 weeks)", "1–3 months", "3–6 months", "Planning ahead (6 months+)"];
export const BUDGETS = ["Under ₹50K", "₹50K–₹1L", "₹1L–₹2L", "₹2L–₹5L", "₹5L–₹10L", "₹10L+"];
