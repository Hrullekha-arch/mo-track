import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "src/lib/gst-jurisdiction.ts");
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;

const loadedModule = { exports: {} };
new Function("exports", "module", output)(
  loadedModule.exports,
  loadedModule
);

const {
  allocateGstByTaxMode,
  formatInvoiceState,
  formatIndianAddress,
  resolveGstTaxMode,
  sanitizeLegacySelectText,
} = loadedModule.exports;

const sellerGstin = "06AAMCM5012B1ZY";

assert.deepEqual(
  resolveGstTaxMode({
    sellerGstin,
    shippingAddress: {
      line1: "Vijayawada",
      state: "Andhra Pradesh",
      pincode: "520001",
    },
  }),
  {
    mode: "INTERSTATE",
    sellerStateCode: "06",
    destinationStateCode: "37",
  }
);

assert.equal(
  resolveGstTaxMode({
    sellerGstin,
    destinationGstin: "02AAHPD4666L1ZQ",
  }).mode,
  "INTERSTATE"
);

assert.equal(
  resolveGstTaxMode({
    sellerGstin,
    billingAddress: { state: "Haryana" },
  }).mode,
  "INTRASTATE"
);

assert.deepEqual(resolveGstTaxMode({ sellerGstin }), {
  mode: "INTRASTATE",
  sellerStateCode: "06",
  destinationStateCode: "06",
});

assert.deepEqual(allocateGstByTaxMode(180, "INTERSTATE"), {
  cgst: 0,
  sgst: 0,
  igst: 180,
});
assert.deepEqual(allocateGstByTaxMode(180, "INTRASTATE"), {
  cgst: 90,
  sgst: 90,
  igst: 0,
});

assert.equal(
  formatIndianAddress({
    line1: "Village Rajampur",
    city: "Bhatu Palam",
    state: "Himachal Pradesh",
    pincode: "176061",
  }),
  "Village Rajampur, Bhatu Palam, Himachal Pradesh, 176061"
);
assert.equal(
  sanitizeLegacySelectText("--SELECT--HARYANA"),
  "HARYANA"
);
assert.equal(
  formatIndianAddress("C-501, Gurugram, --SELECT--HARYANA"),
  "C-501, Gurugram, HARYANA"
);
assert.equal(formatInvoiceState("--SELECT--HARYANA"), "HARYANA");
assert.equal(
  resolveGstTaxMode({
    sellerGstin,
    billingAddress: { state: "--SELECT--HARYANA" },
  }).mode,
  "INTRASTATE"
);

const invoiceUtilsPath = resolve(root, "src/lib/invoice-utils.ts");
const invoiceUtilsOutput = ts.transpileModule(
  readFileSync(invoiceUtilsPath, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: invoiceUtilsPath,
  }
).outputText;
const invoiceUtilsModule = { exports: {} };
new Function("exports", "require", "module", invoiceUtilsOutput)(
  invoiceUtilsModule.exports,
  (request) => {
    if (request === "@/lib/types") return {};
    if (request === "@/lib/gst-jurisdiction") return loadedModule.exports;
    if (request === "@/lib/financial-year") {
      return {
        getMoDesignsCompanyName: () => "MO Designs Private Limited",
        normalizeCompanyFinancialYear: (name) => name,
      };
    }
    throw new Error(`Unexpected import: ${request}`);
  },
  invoiceUtilsModule
);

const interstateInvoice = {
  id: "invoice-test",
  invoiceNo: "1",
  invoiceDate: "2026-06-14",
  invoiceType: "NORMAL",
  orderId: "MOTRACK-TEST",
  createdAt: "2026-06-14T00:00:00.000Z",
  createdBy: "Test",
  salesPerson: "Test",
  sellerSnapshot: {
    companyName: "MO Designs Private Limited",
    address: "Gurugram, Haryana",
    gstin: sellerGstin,
  },
  customerSnapshot: {
    name: "Andhra Customer",
    phone: "9999999999",
    gstin: "37ABCDE1234F1Z5",
    billingAddress: {
      line1: "Vijayawada",
      city: "Vijayawada",
      state: "Andhra Pradesh",
      pincode: "520001",
    },
    shippingAddress: {
      line1: "Vijayawada",
      city: "Vijayawada",
      state: "Andhra Pradesh",
      pincode: "520001",
    },
  },
  sections: {
    NORMAL: {
      items: [
        {
          bcn: "TEST-1",
          description: "Test item",
          qty: 1,
          rate: 1000,
          taxableAmount: 1000,
          gst: 18,
          gstAmount: 180,
          totalAmount: 1180,
        },
      ],
    },
  },
};

const invoicePayload =
  invoiceUtilsModule.exports.buildPrintablePayloadFromInvoice(interstateInvoice);
assert.equal(invoicePayload.totals.cgst, 0);
assert.equal(invoicePayload.totals.sgst, 0);
assert.equal(invoicePayload.totals.igst, 180);
assert.equal(invoicePayload.items[0].igst, 180);
assert.equal(invoicePayload.customer.state, "ANDHRA PRADESH");
assert.equal(invoicePayload.customer.pincode, "520001");
assert.match(invoicePayload.customer.address, /Andhra Pradesh/);

const defaultHaryanaInvoice = structuredClone(interstateInvoice);
defaultHaryanaInvoice.customerSnapshot = {
  name: "Customer Without State",
  phone: "9999999999",
};
const defaultHaryanaPayload =
  invoiceUtilsModule.exports.buildPrintablePayloadFromInvoice(
    defaultHaryanaInvoice
  );
assert.equal(defaultHaryanaPayload.customer.state, "HARYANA");
assert.equal(defaultHaryanaPayload.customer.placeOfSupply, "HARYANA");
assert.equal(defaultHaryanaPayload.totals.cgst, 90);
assert.equal(defaultHaryanaPayload.totals.sgst, 90);
assert.equal(defaultHaryanaPayload.totals.igst, 0);

const legacySelectInvoice = structuredClone(interstateInvoice);
legacySelectInvoice.customerSnapshot = {
  name: "Legacy Haryana Customer",
  phone: "9999999999",
  billingAddress: {
    line1: "C-501, Gurugram, --SELECT--HARYANA",
    state: "--SELECT--HARYANA",
    pincode: "122001",
  },
  shippingAddress: {
    line1: "C-501, Gurugram, --SELECT--HARYANA",
    state: "--SELECT--HARYANA",
    pincode: "122001",
  },
};
const legacySelectPayload =
  invoiceUtilsModule.exports.buildPrintablePayloadFromInvoice(
    legacySelectInvoice
  );
assert.equal(legacySelectPayload.customer.state, "HARYANA");
assert.equal(legacySelectPayload.customer.placeOfSupply, "HARYANA");
assert.equal(
  legacySelectPayload.customer.address,
  "C-501, Gurugram, HARYANA, 122001"
);

console.log("gst-jurisdiction: all checks passed");
