import type { Room } from "./data";
import { STYLE_NOTE, STYLES, PALETTES, VISIT_PURPOSES, ROOMS } from "./data";

type PrintOptions = {
  customerName: string;
  phone: string;
  styleId: string;
  palette: string;
  visitPurpose: string;
  budget: string;
  timeline: string;
  threeWords: string;
  matchedRooms: Room[];
  selectedRooms: string[];
  interestedProducts: string[];
  associateNotes: string;
  leadStatus: string;
  followUpDate: string;
  sessionTags: string[];
  briefLineItems: string[];
};

export function openPrintWindow(o: PrintOptions) {
  const selStyle = STYLES.find((s) => s.id === o.styleId);
  const selPalette = PALETTES.find((p) => p.id === o.palette);
  const selPurpose = VISIT_PURPOSES.find((v) => v.id === o.visitPurpose);
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const leadStatusLabel: Record<string, string> = {
    hot: "Hot Lead", warm: "Warm — Follow Up", quote: "Quote Pending",
    converted: "Converted ✓", cold: "Cold / Not Interested",
  };
  const statusColorMap: Record<string, { color: string; border: string; bg: string }> = {
    hot: { color: "#ef4444", border: "rgba(239,68,68,0.45)", bg: "rgba(239,68,68,0.08)" },
    warm: { color: "#f59e0b", border: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.08)" },
    quote: { color: "#8b5cf6", border: "rgba(139,92,246,0.45)", bg: "rgba(139,92,246,0.08)" },
    converted: { color: "#22c55e", border: "rgba(34,197,94,0.45)", bg: "rgba(34,197,94,0.08)" },
    cold: { color: "#9ca3af", border: "rgba(156,163,175,0.3)", bg: "rgba(156,163,175,0.06)" },
  };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Style Brief — ${o.customerName || "Client"}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Montserrat',sans-serif;font-weight:300;background:#1A1208;color:#FFF;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:0;}
  @media print{html,body{width:210mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}

  .page{width:210mm;min-height:297mm;page-break-after:always;position:relative;
    overflow:hidden;background:#1A1208;display:flex;flex-direction:column;}
  .page:last-child{page-break-after:avoid;}

  /* Shimmer bars */
  .shimmer{height:3px;background:linear-gradient(90deg,transparent 0%,#C9A84C 20%,#E8C97A 50%,#C9A84C 80%,transparent 100%);}

  /* Letterhead */
  .lh{display:flex;justify-content:space-between;align-items:center;
    padding:13px 44px;border-bottom:1px solid rgba(201,168,76,0.22);}
  .lh-brand{display:flex;align-items:center;gap:9px;font-size:6.5px;
    letter-spacing:0.55em;text-transform:uppercase;color:rgba(201,168,76,0.6);}
  .lh-right{font-size:6.5px;letter-spacing:0.2em;text-transform:uppercase;
    color:rgba(255,255,255,0.22);text-align:right;}

  /* Hero */
  .hero{padding:40px 44px 32px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.22);
    position:relative;}
  .hero-tag{font-size:6.5px;letter-spacing:0.65em;text-transform:uppercase;
    color:rgba(201,168,76,0.42);margin-bottom:16px;}
  .hero-name{font-family:'Cormorant Garamond',serif;font-size:58px;font-weight:300;
    color:#FFF;letter-spacing:4px;line-height:0.95;margin-bottom:0;}
  .hero-words{font-family:'Cormorant Garamond',serif;font-size:20px;font-style:italic;
    color:#E8C97A;letter-spacing:1.5px;margin-top:14px;}
  .rule{display:flex;align-items:center;gap:14px;margin:22px auto 18px;max-width:420px;}
  .rule-line{flex:1;height:1px;background:rgba(201,168,76,0.3);}
  .badges{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;}
  .badge{font-size:6.5px;letter-spacing:0.2em;text-transform:uppercase;
    padding:4px 14px;border:1px solid rgba(201,168,76,0.48);color:#E8C97A;
    background:rgba(201,168,76,0.07);}
  .badge-n{border-color:rgba(255,255,255,0.13);color:rgba(255,255,255,0.42);background:rgba(255,255,255,0.03);}
  .badge-g{border-color:rgba(52,211,153,0.3);color:#34d399;background:rgba(52,211,153,0.05);}
  .badge-p{border-color:rgba(139,124,246,0.3);color:#a78bfa;background:rgba(139,124,246,0.05);}

  /* 3-column body */
  .body3{display:grid;grid-template-columns:1fr 2px 1fr 2px 1fr;flex:1;}
  .divline{background:linear-gradient(180deg,transparent 0%,rgba(201,168,76,0.4) 12%,rgba(201,168,76,0.4) 88%,transparent 100%);}
  .col{padding:26px 32px 28px;}

  /* Column header */
  .col-hdr{font-size:6.5px;letter-spacing:0.5em;text-transform:uppercase;color:#C9A84C;
    margin-bottom:20px;display:flex;align-items:center;gap:8px;}
  .col-hdr-line{flex:1;height:1px;background:rgba(201,168,76,0.22);}

  /* Style Profile */
  .prof-row{padding:9px 0;border-bottom:1px solid rgba(201,168,76,0.07);}
  .prof-key{font-size:6.5px;letter-spacing:0.2em;text-transform:uppercase;
    color:rgba(201,168,76,0.42);margin-bottom:3px;}
  .prof-val{font-family:'Cormorant Garamond',serif;font-size:15px;
    color:rgba(255,255,255,0.9);line-height:1.4;}

  /* Palette */
  .swatch-bar{display:flex;height:85px;overflow:hidden;
    border:1px solid rgba(201,168,76,0.22);margin-bottom:12px;}
  .sw-seg{flex:1;}
  .sw-seg-inner{width:100%;height:100%;}
  .pal-name{font-family:'Cormorant Garamond',serif;font-size:18px;font-style:italic;
    color:#FFF;letter-spacing:0.5px;margin-bottom:4px;}
  .pal-desc{font-size:7.5px;color:rgba(255,255,255,0.28);letter-spacing:0.08em;margin-bottom:16px;}
  .sw-dots{display:flex;gap:5px;margin-bottom:18px;}
  .sw-dot{flex:1;height:4px;border:1px solid rgba(255,255,255,0.08);}
  .spaces{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
  .space-pill{padding:4px 11px;border:1px solid rgba(201,168,76,0.22);
    color:rgba(255,255,255,0.48);font-size:7.5px;letter-spacing:0.07em;
    background:rgba(255,255,255,0.025);}

  /* Guidance */
  .qmark{font-family:'Cormorant Garamond',serif;font-size:72px;color:#C9A84C;
    line-height:0.7;margin-bottom:5px;opacity:0.17;}
  .qbar{border-left:3px solid #C9A84C;padding-left:16px;margin-top:-8px;}
  .qtext{font-family:'Cormorant Garamond',serif;font-size:15px;font-style:italic;
    color:rgba(255,255,255,0.82);line-height:1.85;}
  .sdir{display:flex;align-items:center;gap:9px;margin-top:14px;}
  .sdir-line{width:24px;height:1px;background:rgba(201,168,76,0.45);}
  .sdir-lbl{font-size:6.5px;letter-spacing:0.22em;text-transform:uppercase;
    color:rgba(201,168,76,0.65);}
  .int-hdr{font-size:6.5px;letter-spacing:0.5em;text-transform:uppercase;color:#C9A84C;
    margin:20px 0 12px;display:flex;align-items:center;gap:8px;}
  .int-hdr-line{flex:1;height:1px;background:rgba(201,168,76,0.22);}
  .int-row{display:flex;align-items:center;gap:8px;padding:7px 0;
    border-bottom:1px solid rgba(201,168,76,0.07);}
  .int-star{color:#C9A84C;font-size:7.5px;flex-shrink:0;}
  .int-name{font-family:'Cormorant Garamond',serif;font-size:14px;
    color:rgba(255,255,255,0.75);line-height:1.3;}

  /* Footer */
  .footer{display:flex;justify-content:space-between;align-items:center;
    padding:8px 44px;border-top:1px solid rgba(201,168,76,0.2);}
  .ft{font-size:6.5px;letter-spacing:0.14em;text-transform:uppercase;
    color:rgba(255,255,255,0.22);}

  /* PAGE 2 — Products (dark luxury) */
  .pg2-lh{display:flex;justify-content:space-between;align-items:center;padding:13px 44px;
    border-bottom:1px solid rgba(201,168,76,0.22);}
  .pg2-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;
    color:#FFF;letter-spacing:1px;}
  .pg2-title em{color:#E8C97A;font-style:italic;}
  .room-section{margin:0 0 10px;}
  .room-hdr{display:flex;align-items:baseline;gap:12px;padding:12px 44px 5px;
    border-bottom:1px solid rgba(201,168,76,0.14);}
  .room-nm{font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:300;
    color:#FFF;letter-spacing:0.8px;}
  .room-ct{font-size:7px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(201,168,76,0.5);}
  .prod-grid{display:grid;grid-template-columns:1fr 1fr;padding:0 44px;}
  .prod-item{display:flex;align-items:flex-start;gap:9px;padding:8px 10px;
    border:1px solid rgba(201,168,76,0.1);margin:-1px 0 0 -1px;background:rgba(255,255,255,0.015);}
  .prod-item.starred{background:rgba(201,168,76,0.07);border-color:rgba(201,168,76,0.3);}
  .p-num{width:18px;height:18px;display:flex;align-items:center;justify-content:center;
    font-size:8px;color:#C9A84C;border:1px solid rgba(201,168,76,0.28);
    flex-shrink:0;margin-top:1px;}
  .p-num.s{background:#C9A84C;color:#1A1208;font-weight:700;border-color:#C9A84C;}
  .p-nm{font-family:'Cormorant Garamond',serif;font-size:13px;color:rgba(255,255,255,0.88);line-height:1.3;}
  .p-nm.s{color:#E8C97A;font-style:italic;}
  .p-ct{font-size:6.5px;letter-spacing:0.1em;text-transform:uppercase;
    color:rgba(201,168,76,0.32);margin-top:2px;}
  .ptag{font-size:6px;letter-spacing:0.1em;text-transform:uppercase;
    padding:2px 6px;margin-left:auto;white-space:nowrap;flex-shrink:0;margin-top:2px;}
  .pt-premium{background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.35);color:#C9A84C;}
  .pt-bestseller{background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.28);color:#34d399;}
  .pt-popular{background:rgba(139,124,246,0.1);border:1px solid rgba(139,124,246,0.28);color:#a78bfa;}
  .int-sum{padding:12px 44px;border-top:1px solid rgba(201,168,76,0.14);}
  .int-pill{display:inline-block;font-size:8px;padding:4px 11px;
    border:1px solid rgba(201,168,76,0.32);background:rgba(201,168,76,0.07);
    color:#E8C97A;margin:3px 4px 3px 0;}

  /* PAGE 3 — Notes */
  .pg3-grid{display:grid;grid-template-columns:1fr 220px;padding:18px 44px 0;gap:0;flex:1;}
  .notes-area{border-right:1px solid rgba(201,168,76,0.18);padding-right:22px;}
  .notes-lbl{font-size:6.5px;letter-spacing:0.22em;text-transform:uppercase;
    color:#C9A84C;margin-bottom:10px;}
  .notes-box{padding:14px;border:1px solid rgba(201,168,76,0.18);
    background:rgba(255,255,255,0.025);min-height:180px;
    font-size:10px;color:rgba(255,255,255,0.7);line-height:1.9;white-space:pre-wrap;}
  .meta-col{padding-left:22px;display:flex;flex-direction:column;gap:16px;}
  .m-lbl{font-size:6.5px;letter-spacing:0.2em;text-transform:uppercase;color:#C9A84C;margin-bottom:7px;}
  .m-status{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
    border:1px solid;font-size:9px;font-weight:500;}
  .m-date{font-size:10px;color:rgba(255,255,255,0.65);padding:7px 10px;
    background:rgba(255,255,255,0.03);border:1px solid rgba(201,168,76,0.2);}
  .m-tag{display:inline-block;padding:3px 9px;font-size:8px;
    background:rgba(201,168,76,0.07);border:1px solid rgba(201,168,76,0.25);
    color:rgba(255,255,255,0.6);margin:3px 3px 3px 0;letter-spacing:0.04em;}
  .m-int{display:flex;align-items:center;gap:7px;padding:5px 8px;
    border:1px solid rgba(201,168,76,0.15);margin:-1px 0 0 0;
    background:rgba(201,168,76,0.04);}
  .sig-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;padding:22px 44px;}
  .sig-l{border-top:1px solid rgba(201,168,76,0.28);padding-top:5px;}
  .sig-lbl{font-size:6.5px;letter-spacing:0.16em;text-transform:uppercase;
    color:rgba(255,255,255,0.25);}
</style>
</head>
<body>

<!-- ══ PAGE 1: Style Brief ══ -->
<div class="page">
  <div class="shimmer"></div>

  <!-- Letterhead -->
  <div class="lh">
    <div class="lh-brand">
      <span style="color:#C9A84C;font-size:7px;opacity:0.6;">◆</span>
      MO Designs · Gurugram Showroom
      <span style="color:#C9A84C;font-size:7px;opacity:0.6;">◆</span>
    </div>
    <div class="lh-right">
      ${dateStr}${o.phone ? `<br>${o.phone}` : ""}
    </div>
  </div>

  <!-- Hero -->
  <div class="hero">
    <div style="position:absolute;top:14px;left:28px;font-size:8px;color:rgba(201,168,76,0.25);letter-spacing:4px;">◆ ◆</div>
    <div style="position:absolute;top:14px;right:28px;font-size:8px;color:rgba(201,168,76,0.25);letter-spacing:4px;">◆ ◆</div>
    <div class="hero-tag">Curated Style Brief</div>
    <div class="hero-name">${o.customerName || "Guest"}</div>
    ${o.threeWords ? `<div class="hero-words">&ldquo;${o.threeWords}&rdquo;</div>` : ""}
    <div class="rule">
      <div class="rule-line"></div>
      <span style="color:#C9A84C;font-size:7px;opacity:0.45;">◆</span>
      <span style="color:#E8C97A;font-size:12px;">◆</span>
      <span style="color:#C9A84C;font-size:7px;opacity:0.45;">◆</span>
      <div class="rule-line"></div>
    </div>
    <div class="badges">
      ${selPurpose ? `<span class="badge">${selPurpose.label}</span>` : ""}
      ${selStyle ? `<span class="badge">${selStyle.label}</span>` : ""}
      ${selPalette ? `<span class="badge badge-n">${selPalette.label}</span>` : ""}
      ${o.budget ? `<span class="badge badge-g">${o.budget}</span>` : ""}
      ${o.timeline ? `<span class="badge badge-p">${o.timeline}</span>` : ""}
    </div>
  </div>

  <!-- 3-column body -->
  <div class="body3">

    <!-- LEFT: Style Profile -->
    <div class="col">
      <div class="col-hdr">
        <div class="col-hdr-line"></div>Style Profile<div class="col-hdr-line"></div>
      </div>
      ${o.briefLineItems.length === 0
        ? `<div style="font-family:'Cormorant Garamond',serif;font-size:15px;font-style:italic;color:rgba(255,255,255,0.2);">No preferences captured yet.</div>`
        : o.briefLineItems.map((line) => {
            const ci = line.indexOf(": ");
            const key = ci > -1 ? line.slice(0, ci) : "";
            const val = ci > -1 ? line.slice(ci + 2) : line;
            return `<div class="prof-row"><div class="prof-key">${key}</div><div class="prof-val">${val}</div></div>`;
          }).join("")
      }
    </div>

    <div class="divline"></div>

    <!-- CENTRE: Colour + Spaces -->
    <div class="col">
      <div class="col-hdr">
        <div class="col-hdr-line"></div>Colour Direction<div class="col-hdr-line"></div>
      </div>
      ${selPalette ? `
      <div class="swatch-bar">
        ${selPalette.swatches.map((sw) => `<div class="sw-seg" style="background:${sw};flex:1;"></div>`).join("")}
      </div>
      <div class="pal-name">${selPalette.label}</div>
      <div class="pal-desc">${selPalette.desc}</div>
      <div class="sw-dots">
        ${selPalette.swatches.map((sw) => `<div class="sw-dot" style="background:${sw};flex:1;"></div>`).join("")}
      </div>
      ` : `<div style="font-family:'Cormorant Garamond',serif;font-size:15px;font-style:italic;color:rgba(255,255,255,0.2);">No palette selected.</div>`}
      ${o.selectedRooms.length > 0 ? `
      <div class="col-hdr" style="margin-top:20px;">
        <div class="col-hdr-line"></div>Selected Spaces<div class="col-hdr-line"></div>
      </div>
      <div class="spaces">
        ${o.selectedRooms.map((id) => {
          const room = ROOMS.find((r) => r.id === id);
          return room ? `<div class="space-pill">${room.label}</div>` : "";
        }).join("")}
      </div>` : ""}
    </div>

    <div class="divline"></div>

    <!-- RIGHT: Guidance + Items of Interest -->
    <div class="col">
      <div class="col-hdr">
        <div class="col-hdr-line"></div>Associate Guidance<div class="col-hdr-line"></div>
      </div>
      ${o.styleId && STYLE_NOTE[o.styleId] ? `
      <div class="qmark">&ldquo;</div>
      <div class="qbar">
        <div class="qtext">${STYLE_NOTE[o.styleId]}</div>
      </div>
      ${selStyle ? `
      <div class="sdir">
        <div class="sdir-line"></div>
        <div class="sdir-lbl">${selStyle.label} Direction</div>
      </div>` : ""}
      ` : `<div style="font-family:'Cormorant Garamond',serif;font-size:15px;font-style:italic;color:rgba(255,255,255,0.2);">No style selected.</div>`}
      ${o.interestedProducts.length > 0 ? `
      <div class="int-hdr" style="margin-top:20px;">
        <div class="int-hdr-line"></div>Items of Interest<div class="int-hdr-line"></div>
      </div>
      ${o.interestedProducts.slice(0, 7).map((name) => `
      <div class="int-row">
        <span class="int-star">★</span>
        <span class="int-name">${name}</span>
      </div>`).join("")}
      ${o.interestedProducts.length > 7 ? `<div style="font-size:7px;color:rgba(201,168,76,0.4);margin-top:7px;letter-spacing:0.12em;">+${o.interestedProducts.length - 7} more items</div>` : ""}
      ` : ""}
    </div>
  </div>

  <div class="footer">
    <span class="ft">MO Designs · Confidential</span>
    <span style="color:#C9A84C;font-size:9px;">◆</span>
    <span class="ft">Page 1 of 3</span>
  </div>
  <div class="shimmer"></div>
</div>

<!-- ══ PAGE 2: Product Recommendations ══ -->
<div class="page">
  <div class="shimmer"></div>

  <div class="pg2-lh">
    <div>
      <div style="font-size:6.5px;letter-spacing:0.5em;text-transform:uppercase;color:rgba(201,168,76,0.5);margin-bottom:5px;">MO Designs · Product Recommendations</div>
      <div class="pg2-title">${o.customerName || "Guest"} — <em>Curated Selections</em></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.25);">${o.matchedRooms.length} space${o.matchedRooms.length !== 1 ? "s" : ""} curated</div>
      <div style="font-size:7px;color:rgba(201,168,76,0.4);margin-top:3px;">${dateStr}</div>
    </div>
  </div>

  ${o.matchedRooms.map((room) => `
  <div class="room-section">
    <div class="room-hdr">
      <div class="room-nm">${room.label}</div>
      <div class="room-ct">${room.products.length} products</div>
    </div>
    <div class="prod-grid">
      ${room.products.map((prod, i) => {
        const starred = o.interestedProducts.includes(prod.name);
        const tagClass = prod.tag === "Premium" ? "pt-premium" : prod.tag === "Bestseller" ? "pt-bestseller" : prod.tag === "Popular" ? "pt-popular" : "";
        return `<div class="prod-item${starred ? " starred" : ""}">
          <div class="p-num${starred ? " s" : ""}">${starred ? "★" : i + 1}</div>
          <div style="flex:1;">
            <div class="p-nm${starred ? " s" : ""}">${prod.name}</div>
            <div class="p-ct">${prod.cat}</div>
          </div>
          ${prod.tag ? `<span class="ptag ${tagClass}">${prod.tag}</span>` : ""}
        </div>`;
      }).join("")}
    </div>
  </div>`).join("")}

  ${o.interestedProducts.length ? `
  <div class="int-sum">
    <div style="font-size:6.5px;letter-spacing:0.4em;text-transform:uppercase;color:#C9A84C;margin-bottom:8px;">★ Items of Interest (${o.interestedProducts.length})</div>
    <div>${o.interestedProducts.map((name) => `<span class="int-pill">★ ${name}</span>`).join("")}</div>
  </div>` : ""}

  <div class="footer" style="margin-top:auto;">
    <span class="ft">MO Designs · Confidential</span>
    <span style="color:#C9A84C;font-size:9px;">◆</span>
    <span class="ft">Page 2 of 3</span>
  </div>
  <div class="shimmer"></div>
</div>

<!-- ══ PAGE 3: Associate Notes ══ -->
<div class="page">
  <div class="shimmer"></div>

  <div class="pg2-lh">
    <div>
      <div style="font-size:6.5px;letter-spacing:0.5em;text-transform:uppercase;color:rgba(201,168,76,0.5);margin-bottom:5px;">MO Designs · Session Summary</div>
      <div class="pg2-title">${o.customerName || "Guest"} — <em>Associate Notes</em></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.25);">Page 3 · Internal</div>
      <div style="font-size:7px;color:rgba(201,168,76,0.4);margin-top:3px;">${dateStr}</div>
    </div>
  </div>

  <div class="pg3-grid">
    <div class="notes-area">
      <div class="notes-lbl">Associate Notes</div>
      <div class="notes-box">${o.associateNotes || "No notes recorded for this session."}</div>
    </div>
    <div class="meta-col">
      ${o.leadStatus && statusColorMap[o.leadStatus] ? `
      <div>
        <div class="m-lbl">Lead Status</div>
        <div class="m-status" style="color:${statusColorMap[o.leadStatus].color};border-color:${statusColorMap[o.leadStatus].border};background:${statusColorMap[o.leadStatus].bg};">
          ● ${leadStatusLabel[o.leadStatus]}
        </div>
      </div>` : ""}
      ${o.followUpDate ? `
      <div>
        <div class="m-lbl">Follow-up Date</div>
        <div class="m-date">${new Date(o.followUpDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>` : ""}
      ${o.sessionTags.length ? `
      <div>
        <div class="m-lbl">Session Tags</div>
        <div>${o.sessionTags.map((t) => `<span class="m-tag">${t}</span>`).join("")}</div>
      </div>` : ""}
      ${o.interestedProducts.length ? `
      <div>
        <div class="m-lbl">Items of Interest</div>
        ${o.interestedProducts.map((name) => `
        <div class="m-int">
          <span style="color:#C9A84C;font-size:8px;">★</span>
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px;color:rgba(255,255,255,0.72);">${name}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>
  </div>

  <div class="sig-row">
    <div><div class="sig-l"></div><div class="sig-lbl">Associate Signature</div></div>
    <div><div class="sig-l"></div><div class="sig-lbl">Client Acknowledgement</div></div>
    <div><div class="sig-l"></div><div class="sig-lbl">Manager / HOD</div></div>
  </div>

  <div class="footer" style="margin-top:auto;">
    <span class="ft">MO Designs · Internal Document</span>
    <span style="color:#C9A84C;font-size:9px;">◆</span>
    <span class="ft">Page 3 of 3</span>
  </div>
  <div class="shimmer"></div>
</div>

</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = function () { win.print(); };
}
