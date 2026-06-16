import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";

const outDir = path.join(process.cwd(), "docs");
const outFile = path.join(outDir, "mo-track-er-database-flow.pdf");

fs.mkdirSync(outDir, { recursive: true });

const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 34;

const colors = {
  ink: [18, 24, 38],
  muted: [88, 99, 119],
  border: [205, 213, 225],
  fill: [248, 250, 252],
  blue: [37, 99, 235],
  green: [5, 150, 105],
  amber: [217, 119, 6],
  violet: [124, 58, 237],
  red: [220, 38, 38],
};

function setColor(name) {
  doc.setTextColor(...colors[name]);
}

function title(text, sub) {
  setColor("ink");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(text, margin, 58);
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setColor("muted");
    doc.text(sub, margin, 78);
  }
}

function footer(pageLabel) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor("muted");
  doc.text("Mo Track project database and flow reference", margin, pageHeight - 18);
  doc.text(pageLabel, pageWidth - margin - doc.getTextWidth(pageLabel), pageHeight - 18);
}

function box(x, y, w, h, label, opts = {}) {
  const fill = opts.fill || colors.fill;
  const stroke = opts.stroke || colors.border;
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.roundedRect(x, y, w, h, 5, 5, "FD");
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.size || 9);
  setColor(opts.color || "ink");
  const lines = doc.splitTextToSize(label, w - 14);
  doc.text(lines, x + 7, y + 16);
}

function arrow(x1, y1, x2, y2, color = "muted") {
  doc.setDrawColor(...colors[color]);
  doc.setLineWidth(1);
  doc.line(x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 6;
  const a1 = angle - Math.PI / 7;
  const a2 = angle + Math.PI / 7;
  doc.line(x2, y2, x2 - size * Math.cos(a1), y2 - size * Math.sin(a1));
  doc.line(x2, y2, x2 - size * Math.cos(a2), y2 - size * Math.sin(a2));
}

function sectionHeader(text, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setColor("blue");
  doc.text(text, x, y);
}

function bullets(items, x, y, maxWidth = 245, lineHeight = 13) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setColor("ink");
  let cy = y;
  for (const item of items) {
    const lines = doc.splitTextToSize(`- ${item}`, maxWidth);
    doc.text(lines, x, cy);
    cy += lines.length * lineHeight;
  }
}

// Page 1
title("Mo Track ER Diagram, Database Diagram and Flow", "Firestore + Zoho Books integration overview");
box(54, 122, 150, 42, "USER\nusers/{userId}", { bold: true, fill: [239, 246, 255], stroke: colors.blue });
box(250, 122, 150, 42, "CUSTOMER\ncustomers/{customerId}", { bold: true });
box(446, 122, 150, 42, "DEAL\ncustomers/*/deals/{dealId}", { bold: true });
box(642, 122, 150, 42, "QUOTATION\n.../quotations/{quotationId}", { bold: true });

box(446, 226, 150, 42, "ORDER\norders/{orderId}", { bold: true, fill: [240, 253, 244], stroke: colors.green });
box(642, 226, 150, 42, "INVOICE\ninvoices/{invoiceId}", { bold: true, fill: [255, 251, 235], stroke: colors.amber });

box(250, 330, 150, 42, "PURCHASE REQUEST\npurchaseRequests/{id}", { bold: true });
box(446, 330, 150, 42, "INBOUND\ninbounds/{id}", { bold: true });
box(642, 330, 150, 42, "STOCK\nstocks/{stockId}", { bold: true, fill: [245, 243, 255], stroke: colors.violet });
box(642, 422, 150, 42, "STOCK LENGTHS\nstocks/*/lengths/{lengthId}", { bold: true });

arrow(204, 143, 250, 143, "blue");
arrow(400, 143, 446, 143);
arrow(596, 143, 642, 143);
arrow(520, 164, 520, 226, "green");
arrow(596, 247, 642, 247, "amber");
arrow(520, 268, 325, 330);
arrow(400, 351, 446, 351);
arrow(596, 351, 642, 351, "violet");
arrow(717, 372, 717, 422, "violet");
arrow(717, 422, 717, 268, "green");

sectionHeader("Key relationships", 54, 430);
bullets(
  [
    "Customer has many deals; deals hold quotations, visits, measurements and receipts.",
    "Approved quotation converts into top-level orders/{orderId}.",
    "Purchase requests and inbound receiving add stock into stocks and lengths.",
    "Invoice generation reads order allocation and stock references, then creates Zoho invoice.",
  ],
  54,
  450,
  500
);
footer("Page 1 / 4");

// Page 2
doc.addPage();
title("Firestore Database Diagram", "Main collections and nested collections");
const leftX = 50;
const midX = 312;
const rightX = 574;
sectionHeader("CRM / Sales", leftX, 118);
bullets(
  [
    "users/{userId}",
    "customers/{customerId}",
    "customers/{customerId}/deals/{dealId}",
    "deals/{dealId}/quotations/{quotationId}",
    "deals/{dealId}/visits/{visitId}",
    "deals/{dealId}/measurements/{measurementId}",
    "deals/{dealId}/receipts/{receiptId}",
    "Walkin_Customer/{leadId}",
    "companyVisits/{visitId}",
    "salesmanCrmAssignments/{salesmanName}",
  ],
  leftX,
  140
);
sectionHeader("Orders / Purchase / Inventory", midX, 118);
bullets(
  [
    "orders/{orderId}",
    "purchaseRequests/{purchaseRequestId}",
    "inbounds/{inboundId}",
    "stocks/{stockId}",
    "stocks/{stockId}/lengths/{lengthId}",
    "stocks/{stockId}/lengths/{lengthId}/reservedQty/{reservationId}",
    "PendingPurchaseEntry/{entryId}",
    "Cutting/{taskId}",
    "taxDetails/{taxId}",
    "o2d/{o2dId}",
  ],
  midX,
  140
);
sectionHeader("Invoice / Zoho / PMS / HR", rightX, 118);
bullets(
  [
    "invoices/{invoiceId}",
    "zohoTokenDetails/{docId}",
    "jobs/{jobId}",
    "jobs/{jobId}/workLogs/{logId}",
    "plan/{planId}",
    "machines/{machineId}",
    "people/{personId}",
    "products/{productId}",
    "machineSkills/{skillId}",
    "hrLeaveRequests/{requestId}",
  ],
  rightX,
  140
);
box(54, 388, 220, 76, "Stock List source\n/adminDb.collection(\"stocks\")\nTotal Qty = stocks/{stockId}.totalQty\nAvailable = availableQty\nReserved = reservedQty", { fill: [245, 243, 255], stroke: colors.violet, bold: true });
box(312, 388, 220, 76, "Invoice source\norders/{orderId}\nsections.NORMAL.items\nallocation.lengths\ninvoices/{invoiceId}", { fill: [255, 251, 235], stroke: colors.amber, bold: true });
box(574, 388, 220, 76, "Zoho source\nZoho Books API\ncustomers/items/invoices/PO\nlinked by zoho* IDs", { fill: [239, 246, 255], stroke: colors.blue, bold: true });
footer("Page 2 / 4");

// Page 3
doc.addPage();
title("Business Flow", "Customer to invoice to Zoho");
const y = 138;
const stepW = 120;
const gap = 24;
const xs = [36, 180, 324, 468, 612];
box(xs[0], y, stepW, 54, "1. Customer / Walk-in\nLead created", { bold: true });
box(xs[1], y, stepW, 54, "2. Deal\nCRM follow-up", { bold: true });
box(xs[2], y, stepW, 54, "3. Visit / Measurement\nSite data", { bold: true });
box(xs[3], y, stepW, 54, "4. Quotation\nItems + VAS", { bold: true });
box(xs[4], y, stepW, 54, "5. Order\norders/{orderId}", { bold: true, fill: [240, 253, 244], stroke: colors.green });
for (let i = 0; i < xs.length - 1; i += 1) arrow(xs[i] + stepW, y + 27, xs[i + 1], y + 27);

box(180, 270, 120, 54, "6A. Stock available\nAllocate stock", { bold: true, fill: [245, 243, 255], stroke: colors.violet });
box(324, 270, 120, 54, "6B. Purchase Request\nIf stock missing", { bold: true });
box(468, 270, 120, 54, "7. Inbound Receive\nUpdate inventory", { bold: true });
box(612, 270, 120, 54, "8. Invoice\nCreate local + Zoho", { bold: true, fill: [255, 251, 235], stroke: colors.amber });
arrow(xs[4] + 60, y + 54, 240, 270, "green");
arrow(300, 297, 324, 297);
arrow(444, 297, 468, 297);
arrow(588, 297, 612, 297);
arrow(528, 270, 240, 324, "violet");

box(324, 408, 140, 54, "Zoho customer\nSearch or create", { bold: true, fill: [239, 246, 255], stroke: colors.blue });
box(500, 408, 140, 54, "Zoho item\nMatch or create", { bold: true, fill: [239, 246, 255], stroke: colors.blue });
box(676, 408, 120, 54, "Zoho invoice\nSave IDs locally", { bold: true, fill: [239, 246, 255], stroke: colors.blue });
arrow(672, 324, 394, 408, "blue");
arrow(464, 435, 500, 435, "blue");
arrow(640, 435, 676, 435, "blue");
footer("Page 3 / 4");

// Page 4
doc.addPage();
title("Inventory and Zoho Flow", "Where quantities and external IDs come from");
sectionHeader("Inventory quantity source", 52, 118);
bullets(
  [
    "Stock List table reads from Firestore stocks collection.",
    "Total Qty column uses stock.totalQty. Legacy/import fallback may use quantity or closingstock in exports.",
    "Available, Reserved, Damaged and Cut use availableQty, reservedQty, damagedQty and cutQty.",
    "Roll/length data lives under stocks/{stockId}/lengths/{lengthId}.",
    "Receiving material through inbound calls updateStockQuantityAction and writes stocks + lengths.",
  ],
  52,
  140,
  345
);
sectionHeader("Zoho connection", 472, 118);
bullets(
  [
    "Zoho is not the inventory source for Stock List.",
    "Zoho is used during invoice/PO generation.",
    "Customer matching uses Zoho customers and stores zohoCustomerId.",
    "Item matching uses Zoho items and stores zohoItemId on invoice lines.",
    "Invoice creation stores zohoInvoiceId and zohoInvoiceNo in Firestore invoices.",
    "Purchase PO creation stores zohoPurchaseOrderId and zohoPurchaseOrderNumber.",
  ],
  472,
  140,
  330
);
sectionHeader("Recommended matching rule", 52, 332);
box(52, 356, 742, 84, "Local Item -> Zoho Item matching priority:\n1. Exact BCN/SKU match. 2. Exact normalized item name. 3. HSN + rate + unit. 4. Manual choice if confidence is low. 5. Create new Zoho item only if no confident match exists.", { bold: true, fill: [240, 253, 244], stroke: colors.green });
sectionHeader("Key local fields", 52, 482);
bullets(
  [
    "stocks.totalQty, availableQty, reservedQty, damagedQty, cutQty",
    "orders.sections.NORMAL.items[].allocation.lengths[].lengthId",
    "orders.sections.NORMAL.items[].allocation.lengths[].stockItemId",
    "invoices.zohoCustomerId, zohoInvoiceId, zohoInvoiceNo",
  ],
  52,
  504,
  720
);
footer("Page 4 / 4");

doc.save(outFile);
console.log(outFile);
