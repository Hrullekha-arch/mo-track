export const fpmsModules = [
  {
    id: "master-data",
    label: "Master Data",
    kicker: "The foundation",
    title: "Master Data Setup",
    summary:
      "Create the core building blocks before any order is scheduled: finished goods, raw materials, and worker skill profiles.",
    bullets: [
      "Item / Product Master with dimensions, variants, and showroom descriptions.",
      "Material Master for timber, fabric, paint, foam, hardware, and consumables with unit costs.",
      "Labour / Artisan directory grouped by skill such as carpenter, painter, upholsterer, and polisher.",
    ],
  },
  {
    id: "bom",
    label: "BOM & Recipe",
    kicker: "What it takes to build one unit",
    title: "Bill of Materials & Recipe Management",
    summary:
      "Define the exact material matrix and the routing order so every product has a repeatable production recipe.",
    bullets: [
      "Map each product to required raw materials and quantity per unit.",
      "Track wastage allowance and stage-specific consumption.",
      "Store routing from carpentry to paint to upholstery to QC and packing.",
    ],
  },
  {
    id: "job-cards",
    label: "Job Cards",
    kicker: "When will it be ready",
    title: "Production Scheduling & Job Cards",
    summary:
      "Turn sales orders into workshop job cards, estimate stage durations, and calculate planned completion with queue-aware scheduling.",
    bullets: [
      "Estimated standard time per stage.",
      "Gantt-style queue logic based on worker or machine availability.",
      "Delivery target formula with drying, curing, or dispatch buffers.",
    ],
  },
  {
    id: "wip",
    label: "WIP Tracking",
    kicker: "Workshop floor visibility",
    title: "Work-in-Progress Tracking",
    summary:
      "Let teams mark stage movement in real time and highlight delays when work remains stuck longer than allocated time.",
    bullets: [
      "Stage check-ins from one department to the next.",
      "Red delay alert when stage SLA is crossed.",
      "Supervisor dashboard for current, waiting, and blocked items.",
    ],
  },
  {
    id: "costing",
    label: "Costing",
    kicker: "Dynamic cost build-up",
    title: "Costing & Total Labour Calculation",
    summary:
      "Calculate the total production cost by combining actual material usage, labour charge model, and overhead percentage.",
    bullets: [
      "Material cost = quantity used x unit price.",
      "Labour cost based on hourly, daily, or piece-rate profile.",
      "Overheads added as a fixed percentage on top of direct cost.",
    ],
  },
  {
    id: "qc",
    label: "QC & Finished",
    kicker: "Gate before next step",
    title: "Quality Control & Finished Goods",
    summary:
      "Use multiple stage checkpoints before the product can move forward, then mark it as passed or send it back for rework.",
    bullets: [
      "Checklist-based inspection per stage.",
      "Pass, hold, or rework loop.",
      "Finished goods release after final approval.",
    ],
  },
] as const;

export const masterDataCards = [
  {
    title: "Item / Product Master",
    items: [
      "Chesterfield 3-Seater Sofa",
      "Oak Dining Table",
      "Curved Accent Chair",
      "Roman Blinds Premium",
    ],
  },
  {
    title: "Material Master",
    items: [
      "Timber by cubic feet",
      "Fabric by meters",
      "Paint or Polish by liters",
      "Screws and hardware by box",
    ],
  },
  {
    title: "Labour / Artisan Profiles",
    items: [
      "Carpenter - Rs 220 / hour",
      "Painter - Rs 1,400 / day",
      "Upholsterer - Rs 950 / piece",
      "Polisher - Rs 180 / hour",
    ],
  },
] as const;

export const productMasterRows = [
  {
    sku: "FG-001",
    name: "Chesterfield 3-Seater Sofa",
    category: "Seating",
    variant: "Velvet / Walnut",
    size: "84 x 36 x 32 in",
  },
  {
    sku: "FG-014",
    name: "Oak Dining Table",
    category: "Dining",
    variant: "6 Seater",
    size: "72 x 36 x 30 in",
  },
  {
    sku: "FG-022",
    name: "Accent Chair",
    category: "Lounge",
    variant: "Boucle / Ash",
    size: "31 x 29 x 31 in",
  },
] as const;

export const preProductionOrders = [
  {
    id: "flow-1",
    orderNo: "SO-52101",
    customer: "Ritika Sharma",
    customerDemand: "Hydraulic storage bed with side drawer and warm walnut finish",
    formStatus: "filled",
    product: "Hydraulic Storage Bed",
    measurement: '78 x 72 x 42 in',
    bedDrawingNo: "DWG-BED-2401",
    furnitureDrawingNo: "DWG-FUR-2401",
    drawingStatus: "pending",
    barcode: "",
    smOwner: "SM-Ajay",
    materialReady: false,
    bomStatus: "locked",
  },
  {
    id: "flow-2",
    orderNo: "SO-52108",
    customer: "Vikram Anand",
    customerDemand: "Queen bed with two side tables and headboard groove design",
    formStatus: "filled",
    product: "Queen Bed with Side Tables",
    measurement: '84 x 66 x 44 in',
    bedDrawingNo: "DWG-BED-2402",
    furnitureDrawingNo: "DWG-FUR-2402",
    drawingStatus: "approved",
    barcode: "BC-SO52108",
    smOwner: "SM-Rahul",
    materialReady: true,
    bomStatus: "started",
  },
  {
    id: "flow-3",
    orderNo: "SO-52115",
    customer: "Nisha Arora",
    customerDemand: "Kids bed with safety rail and toy storage base",
    formStatus: "filled",
    product: "Kids Bed",
    measurement: '72 x 42 x 38 in',
    bedDrawingNo: "DWG-BED-2403",
    furnitureDrawingNo: "DWG-FUR-2403",
    drawingStatus: "rejected",
    barcode: "",
    smOwner: "SM-Sonika",
    materialReady: false,
    bomStatus: "locked",
  },
] as const;

export const materialMasterRows = [
  { code: "RM-101", name: "Seasoned Oak Wood", unit: "cft", unitCost: "Rs 340" },
  { code: "RM-205", name: "Premium Upholstery Fabric", unit: "meter", unitCost: "Rs 780" },
  { code: "RM-318", name: "Foam Sheet 40D", unit: "sheet", unitCost: "Rs 620" },
  { code: "RM-411", name: "Walnut Polish", unit: "liter", unitCost: "Rs 450" },
] as const;

export const laborProfileRows = [
  { artisan: "Ramesh Kumar", skill: "Carpentry", rateType: "Hourly", rate: "Rs 220" },
  { artisan: "Sanjay Das", skill: "Painting / Polish", rateType: "Daily", rate: "Rs 1,400" },
  { artisan: "Arif Khan", skill: "Upholstery", rateType: "Piece", rate: "Rs 950" },
  { artisan: "Mohan Lal", skill: "QC & Packing", rateType: "Hourly", rate: "Rs 180" },
] as const;

export const bomRows = [
  { material: "Premium Fabric", qty: "4 m", stage: "Upholstery", notes: "Seat + back panels" },
  { material: "Seasoned Wood", qty: "1.5 cft", stage: "Carpentry", notes: "Main frame" },
  { material: "Foam Sheet", qty: "2 pcs", stage: "Upholstery", notes: "Seat and armrest" },
  { material: "Polish / Paint", qty: "2 ltr", stage: "Finishing", notes: "Outer visible frame" },
] as const;

export const routingFlow = [
  "Carpentry",
  "Painting / Polishing",
  "Upholstery",
  "QC & Packing",
] as const;

export const schedulingRows = [
  { stage: "Carpentry", duration: "3 days", dependency: "Structure making" },
  { stage: "Painting / Polish", duration: "2 days", dependency: "After carpentry" },
  { stage: "Upholstery", duration: "1 day", dependency: "After finish drying" },
  { stage: "QC & Packing", duration: "0.5 day", dependency: "Final release" },
] as const;

export const jobCardRows = [
  {
    jobCard: "JC-2401",
    orderNo: "SO-50898",
    product: "3-Seater Sofa",
    startDate: "17 May 2026",
    readyDate: "23 May 2026",
    currentQueue: "Painter busy until 18 May",
  },
  {
    jobCard: "JC-2402",
    orderNo: "SO-51019",
    product: "Dining Chair Set",
    startDate: "18 May 2026",
    readyDate: "21 May 2026",
    currentQueue: "Carpentry starts next shift",
  },
  {
    jobCard: "JC-2403",
    orderNo: "SO-51140",
    product: "Accent Chair",
    startDate: "17 May 2026",
    readyDate: "20 May 2026",
    currentQueue: "Upholstery slot reserved",
  },
] as const;

export const wipRows = [
  {
    orderNo: "FP-2401",
    product: "3-Seater Sofa",
    currentStage: "Painting / Polishing",
    age: "2.5 days",
    limit: "2 days",
    state: "Delayed",
  },
  {
    orderNo: "FP-2402",
    product: "Dining Chair Set",
    currentStage: "Carpentry",
    age: "1 day",
    limit: "3 days",
    state: "On Track",
  },
  {
    orderNo: "FP-2403",
    product: "Accent Chair",
    currentStage: "Upholstery",
    age: "0.5 day",
    limit: "1 day",
    state: "On Track",
  },
] as const;

export const costingRows = [
  { component: "Material Cost", formula: "Quantity Used x Material Unit Price" },
  { component: "Labour Cost", formula: "Hours Logged x Hourly Rate or Piece Rate" },
  { component: "Overheads", formula: "5% to 10% of direct cost" },
  { component: "Total Production Cost", formula: "Material + Labour + Overheads" },
] as const;

export const costingSummary = [
  { label: "Material Cost", value: "Rs 8,620" },
  { label: "Labour Cost", value: "Rs 3,450" },
  { label: "Overheads @ 8%", value: "Rs 965" },
  { label: "Total Production Cost", value: "Rs 13,035" },
] as const;

export const qcSamples = [
  {
    key: "qc-carpentry",
    product: "3-Seater Sofa",
    stage: "Carpentry",
    nextLabel: "Move to Painting / Polishing",
    checkpoints: ["Dimension checked", "Frame joints tight", "Surface sanding completed"],
  },
  {
    key: "qc-upholstery",
    product: "Accent Chair",
    stage: "Upholstery",
    nextLabel: "Move to QC & Packing",
    checkpoints: ["Foam alignment checked", "Fabric tension approved", "Stitch finish approved"],
  },
] as const;
