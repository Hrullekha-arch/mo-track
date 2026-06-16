import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import ts from "typescript";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const shouldApply = process.argv.includes("--apply");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const loadPricingModule = () => {
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
  new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output
  )(
    loadedModule.exports,
    () => {
      throw new Error("Unexpected runtime import in pricing module.");
    },
    loadedModule,
    sourcePath,
    dirname(sourcePath)
  );
  return loadedModule.exports;
};

const { buildOrderPricingFromQuotation } = loadPricingModule();
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || ""
);
const db = getFirestore(
  initializeApp(
    { credential: cert(serviceAccount) },
    `quotation-vas-gst-repair-${Date.now()}`
  )
);

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) =>
  Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;

const closeEnough = (left, right, tolerance = 1) =>
  Math.abs(numberValue(left) - numberValue(right)) <= tolerance;

const convertedSnapshot = await db
  .collectionGroup("quotations")
  .where("status", "==", "Converted to Order")
  .get();

const candidates = [];
for (const quotationDocument of convertedSnapshot.docs) {
  const quotation = quotationDocument.data();
  const expected = buildOrderPricingFromQuotation(quotation);
  if (expected.vasItems.length === 0) continue;

  const storedTotal = numberValue(quotation?.totalAmount, Number.NaN);
  if (!Number.isFinite(storedTotal)) continue;

  const expectedTotal = expected.overallSummary.grandTotal;
  const omittedVasGstTotal =
    expected.normalSummary.grandTotal + expected.vasSummary.subTotal;
  const missingAmount = roundMoney(expectedTotal - storedTotal);

  if (
    missingAmount <= 0.05 ||
    !closeEnough(storedTotal, omittedVasGstTotal) ||
    !closeEnough(missingAmount, expected.vasSummary.gstTotal)
  ) {
    continue;
  }

  const orderId = String(
    quotation?.orderNo || `MOTRACK-${quotation?.quotationNo || ""}`
  ).trim();
  const orderReference = db.collection("orders").doc(orderId);
  const orderSnapshot = await orderReference.get();
  const order = orderSnapshot.exists ? orderSnapshot.data() : null;

  candidates.push({
    quotationDocument,
    quotation,
    expected,
    storedTotal,
    expectedTotal,
    missingAmount,
    orderId,
    orderReference,
    order,
    orderRepairEligible:
      !order ||
      closeEnough(
        numberValue(
          order?.overallSummary?.grandTotal ?? order?.totalAmount,
          Number.NaN
        ),
        storedTotal
      ) ||
      closeEnough(
        numberValue(
          order?.overallSummary?.grandTotal ?? order?.totalAmount,
          Number.NaN
        ),
        expectedTotal
      ),
  });
}

const output = {
  mode: shouldApply ? "apply" : "dry-run",
  convertedQuotationCount: convertedSnapshot.size,
  repairCount: candidates.length,
  repairs: candidates.map((candidate) => ({
    quotationNo: candidate.quotation?.quotationNo,
    quotationPath: candidate.quotationDocument.ref.path,
    orderId: candidate.orderId,
    beforeQuotationTotal: candidate.storedTotal,
    afterQuotationTotal: candidate.expectedTotal,
    goodsTotal: candidate.expected.normalSummary.grandTotal,
    vasTaxable: candidate.expected.vasSummary.subTotal,
    vasGst: candidate.expected.vasSummary.gstTotal,
    vasTotal: candidate.expected.vasSummary.grandTotal,
    missingAmount: candidate.missingAmount,
    beforeOrderTotal: numberValue(
      candidate.order?.overallSummary?.grandTotal ??
        candidate.order?.totalAmount,
      Number.NaN
    ),
    orderRepairEligible: candidate.orderRepairEligible,
  })),
};

if (shouldApply) {
  for (const candidate of candidates) {
    const repairedAt = new Date().toISOString();
    const batch = db.batch();
    batch.set(
      candidate.quotationDocument.ref,
      {
        totalAmount: candidate.expectedTotal,
        pricingRepair: {
          source: "VAS_GST_OMITTED_FROM_TOTAL",
          previousTotal: candidate.storedTotal,
          correctedTotal: candidate.expectedTotal,
          vasGstAdded: candidate.expected.vasSummary.gstTotal,
          repairedAt,
        },
      },
      { merge: true }
    );

    if (candidate.order && candidate.orderRepairEligible) {
      batch.set(
        candidate.orderReference,
        {
          "sections.VAS.items": candidate.expected.vasItems,
          "sections.VAS.summary": candidate.expected.vasSummary,
          overallSummary: candidate.expected.overallSummary,
          totalAmount: candidate.expectedTotal,
          pricingRepair: {
            source: "VAS_GST_OMITTED_FROM_TOTAL",
            quotationId: candidate.quotationDocument.id,
            quotationNo: candidate.quotation?.quotationNo,
            previousTotal: numberValue(
              candidate.order?.overallSummary?.grandTotal ??
                candidate.order?.totalAmount
            ),
            correctedTotal: candidate.expectedTotal,
            vasGstAdded: candidate.expected.vasSummary.gstTotal,
            repairedAt,
          },
          updatedAt: repairedAt,
        },
        { merge: true }
      );

      const customerId = String(candidate.order?.customerId || "").trim();
      const dealId = String(candidate.order?.dealId || "").trim();
      const dealOrderDocId = String(
        candidate.order?.dealOrderDocId || ""
      ).trim();
      if (customerId && dealId && dealOrderDocId) {
        batch.set(
          db
            .collection("customers")
            .doc(customerId)
            .collection("deals")
            .doc(dealId)
            .collection("orders")
            .doc(dealOrderDocId),
          {
            overallSummary: candidate.expected.overallSummary,
            updatedAt: repairedAt,
          },
          { merge: true }
        );
      }
    }

    await batch.commit();
  }
}

console.log(JSON.stringify(output, null, 2));
