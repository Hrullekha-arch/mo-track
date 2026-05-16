import {
  escapeHtml,
  formatLabelQty,
  normalizeItemKey,
} from "@/lib/order-utils";

interface BuildAllocationLabelHtmlParams {
  allocatedItemsForLabels: any[];
  stockMetaByBcn: Map<
    string,
    {
      collectionName?: string;
      collectionCode?: string;
    }
  >;

  customerName: string;
  phone: string;
  salesman: string;
  logoUrl: string;
}

export function buildAllocationLabelHtml({
  allocatedItemsForLabels,
  stockMetaByBcn,
  customerName,
  phone,
  salesman,
  logoUrl,
}: BuildAllocationLabelHtmlParams) {
  const labelsHtml = allocatedItemsForLabels
    .map((item, i) => {
      const bcn = escapeHtml(item.bcn);

      const meta = stockMetaByBcn.get(
        normalizeItemKey(item.bcn)
      );

      const fabricName = escapeHtml(
        `${meta?.collectionName || item.itemName || "N/A"} | ${
          meta?.collectionCode || item.bcn || "N/A"
        }`
      );

      const qtyText = `${formatLabelQty(
        item.qty
      )} ${escapeHtml(item.unit || "Mtr")}`;

      return `
        <article class="label">
          <div class="label-head">
            <div class="brand">
              <img src="${logoUrl}" alt="MO Track" />
            </div>

            <div class="label-counter">
              Item ${i + 1}/${allocatedItemsForLabels.length}
            </div>
          </div>

          <div class="label-body">
            <div class="line">
              <span class="k">Customer</span>
              <span class="v">${customerName}</span>
            </div>

            <div class="line">
              <span class="k">Phone</span>
              <span class="v">${phone}</span>
            </div>

            <div class="line">
              <span class="k">Salesman</span>
              <span class="v">${salesman}</span>
            </div>

            <div class="line line-item">
              <span class="k">Fabric</span>
              <span class="v">${fabricName}</span>
            </div>

            <div class="line line-qty">
              <span class="k">Qty</span>
              <span class="v qty-value">${qtyText}</span>
            </div>
          </div>

          <div class="label-foot">
            ${bcn}
          </div>
        </article>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>

<title>Allocation Labels</title>

<style>
*{
  box-sizing:border-box
}

body{
  margin:0;
  padding:.12in;
  background:#fff;
  font-family:"Poppins","Segoe UI",Arial,sans-serif;
  color:#111;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact
}

.sheet{
  display:flex;
  flex-wrap:wrap;
  gap:.08in;
  align-items:flex-start
}

.label{
  width:3in;
  height:2in;
  border:2px solid #0f374d;
  border-radius:14px;
  background:linear-gradient(180deg,#f7fbff 0%,#fff 100%);
  padding:.08in .11in .06in;
  display:grid;
  grid-template-rows:auto 1fr auto;
  gap:.05in;
  break-inside:avoid;
  page-break-inside:avoid;
  overflow:hidden
}

.label-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:.08in
}

.brand{
  height:.34in;
  width:.9in;
  display:flex;
  align-items:center
}

.brand img{
  max-width:100%;
  max-height:100%;
  object-fit:contain
}

.label-counter{
  font-size:11px;
  font-weight:700;
  color:#12384c;
  letter-spacing:.2px
}

.label-body{
  display:grid;
  gap:.02in;
  align-content:start;
  font-size:11px;
  line-height:1.15
}

.line{
  display:flex;
  justify-content:space-between;
  gap:.08in;
  min-width:0;
  border-bottom:1px dashed rgba(15,55,77,.18);
  padding-bottom:1px
}

.line .k{
  flex:0 0 40%;
  font-weight:600;
  color:#284758
}

.line .v{
  flex:1;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  text-align:right;
  color:#101317
}

.line-item .v{
  font-weight:600
}

.line-qty{
  border-bottom:0;
  padding-bottom:0
}

.qty-value{
  font-weight:600;
  color:#0f374d
}

.label-foot{
  text-align:center;
  font-size:17px;
  font-weight:700;
  letter-spacing:.7px;
  color:#0c3145;
  border-top:1px solid rgba(15,55,77,.3);
  padding-top:.03in
}

@page{
  size:auto;
  margin:.1in
}

@media print{
  body{
    margin:0;
    padding:.08in
  }
}
</style>
</head>

<body>
<section class="sheet">
${labelsHtml}
</section>
</body>
</html>
`;
}