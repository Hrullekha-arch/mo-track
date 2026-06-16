import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "src/lib/quotation-order-pricing.ts");
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: sourcePath,
}).outputText;

const loadedModule = { exports: {} };
const execute = new Function(
  "exports",
  "require",
  "module",
  "__filename",
  "__dirname",
  output
);
execute(
  loadedModule.exports,
  () => {
    throw new Error("Unexpected runtime import in pricing module.");
  },
  loadedModule,
  sourcePath,
  dirname(sourcePath)
);

const {
  buildOrderPricingFromQuotation,
  buildOrderPricingUpdateFromQuotation,
  reconcileOrderPricingWithQuotation,
} = loadedModule.exports;

const quotation = {
  id: "quote-test",
  quotationNo: "TEST-1",
  items: [
    {
      id: "hardware-1",
      collectionBrand: "HW-001",
      salesDescription: "Hardware channel",
      quantity: 2,
      rate: 100,
      exclusiveRate: 84.74576271,
      gstPercent: 18,
      gstMode: "EXCL",
      totalAmount: 236,
    },
    {
      id: "fabric-1",
      collectionBrand: "FAB-001",
      salesDescription: "Fabric",
      quantity: 1,
      rate: 105,
      exclusiveRate: 100,
      gstPercent: 5,
      gstMode: "INCL",
      totalAmount: 105,
    },
  ],
  vasDetails: [],
  totalAmount: 341,
};

const pricing = buildOrderPricingFromQuotation(quotation);
assert.equal(pricing.normalItems[0].exclusiveRate, 100);
assert.equal(pricing.normalItems[0].gstAmount, 36);
assert.equal(pricing.normalItems[0].totalAmount, 236);
assert.equal(pricing.normalItems[1].exclusiveRate, 100);
assert.equal(pricing.overallSummary.grandTotal, 341);

const order = {
  id: "MOTRACK-TEST-1",
  crmOrderNo: "TEST-1",
  customerName: "Test",
  customerPhone: "",
  customerAddress: "",
  salesPerson: "",
  orderType: "Retail",
  milestones: [],
  isAcknowledged: true,
  createdAt: new Date(0).toISOString(),
  sections: pricing.sections,
  overallSummary: pricing.overallSummary,
  totalAmount: pricing.overallSummary.grandTotal,
};

assert.deepEqual(reconcileOrderPricingWithQuotation(order, quotation), {
  ok: true,
  issues: [],
  details: [],
});

const migratedOrder = structuredClone(order);
migratedOrder.sections.NORMAL.items =
  migratedOrder.sections.NORMAL.items.map((item, index) => ({
    ...item,
    itemId: `order-item-${index + 1}`,
    roomName: "Migrated room",
  }));
const migratedQuotation = structuredClone(quotation);
migratedQuotation.items = migratedQuotation.items.map((item, index) => ({
  ...item,
  id: `quotation-item-${index + 1}`,
  room: "Original room",
}));
assert.deepEqual(
  reconcileOrderPricingWithQuotation(migratedOrder, migratedQuotation),
  {
    ok: true,
    issues: [],
    details: [],
  }
);

const changedOrder = structuredClone(order);
changedOrder.sections.NORMAL.items[0].gst = 5;
const changedResult = reconcileOrderPricingWithQuotation(
  changedOrder,
  quotation
);
assert.equal(changedResult.ok, false);
assert.ok(changedResult.issues.some((issue) => issue.includes("GST %")));

const quotationWithVas = {
  ...structuredClone(quotation),
  vasDetails: [
    {
      id: "vas-1",
      collectionBrand: "VAS-001",
      vasName: "Installation",
      quantity: 1,
      rate: 1000,
      gstPercent: 18,
      gstMode: "EXCL",
      totalAmount: 1180,
    },
  ],
  totalAmount: 1521,
};
const pricingWithVas = buildOrderPricingFromQuotation(quotationWithVas);
const sectionOrder = {
  ...structuredClone(order),
  sections: pricingWithVas.sections,
  overallSummary: pricingWithVas.overallSummary,
  totalAmount: pricingWithVas.overallSummary.grandTotal,
};

const goodsMismatch = structuredClone(sectionOrder);
goodsMismatch.sections.NORMAL.items[0].exclusiveRate = 999;
goodsMismatch.overallSummary.goodsTotal = 999;
assert.deepEqual(
  reconcileOrderPricingWithQuotation(goodsMismatch, quotationWithVas, "VAS"),
  {
    ok: true,
    issues: [],
    details: [],
  }
);
assert.equal(
  reconcileOrderPricingWithQuotation(goodsMismatch, quotationWithVas, "NORMAL")
    .ok,
  false
);
assert.ok(
  reconcileOrderPricingWithQuotation(goodsMismatch, quotationWithVas, "NORMAL")
    .details.some((detail) => detail.product === "HW-001")
);

const vasMismatch = structuredClone(sectionOrder);
vasMismatch.sections.VAS.items[0].exclusiveRate = 900;
vasMismatch.overallSummary.vasTotal = 1062;
assert.equal(
  reconcileOrderPricingWithQuotation(vasMismatch, quotationWithVas, "VAS").ok,
  false
);
assert.deepEqual(
  reconcileOrderPricingWithQuotation(vasMismatch, quotationWithVas, "NORMAL"),
  {
    ok: true,
    issues: [],
    details: [],
  }
);

const normalizedVasOrder = structuredClone(vasMismatch);
normalizedVasOrder.sections.VAS = structuredClone(pricingWithVas.sections.VAS);
normalizedVasOrder.overallSummary.vasTotal =
  pricingWithVas.overallSummary.vasTotal;
normalizedVasOrder.overallSummary.grandTotal =
  normalizedVasOrder.overallSummary.goodsTotal +
  normalizedVasOrder.overallSummary.vasTotal;
assert.deepEqual(
  reconcileOrderPricingWithQuotation(
    normalizedVasOrder,
    quotationWithVas,
    "VAS"
  ),
  {
    ok: true,
    issues: [],
    details: [],
  }
);

const allocatedOrder = structuredClone(sectionOrder);
allocatedOrder.sections.NORMAL.items[0].allocation = {
  status: "ALLOCATED",
  lengths: [{ lengthId: "LEN-1", allocatedQty: 2 }],
  lots: [],
};
const correctedQuotation = structuredClone(quotationWithVas);
correctedQuotation.items[0].rate = 110;
correctedQuotation.items[0].gstMode = "EXCL";
correctedQuotation.totalAmount = 1544.6;
const pricingUpdate = buildOrderPricingUpdateFromQuotation(
  allocatedOrder,
  correctedQuotation
);
assert.equal(pricingUpdate.ok, true);
assert.equal(
  pricingUpdate.patch.sections.NORMAL.items[0].allocation.lengths[0].lengthId,
  "LEN-1"
);
assert.equal(pricingUpdate.patch.sections.NORMAL.items[0].exclusiveRate, 110);

const quantityChangedQuotation = structuredClone(correctedQuotation);
quantityChangedQuotation.items[0].quantity = 3;
const blockedPricingUpdate = buildOrderPricingUpdateFromQuotation(
  allocatedOrder,
  quantityChangedQuotation
);
assert.equal(blockedPricingUpdate.ok, false);
assert.match(blockedPricingUpdate.message, /Release its allocation/);

console.log("quotation-order-pricing: all checks passed");
