import { GOLD, DARK, CHARCOAL, WARM, BORDER, BORDER_S, GOLD_L } from "./data";

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionBar({ roman, title, subtitle, filled }: { roman: string; title: string; subtitle: string; filled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", marginBottom: 16 }}>
      <div style={{ background: filled ? GOLD : DARK, color: filled ? DARK : GOLD, fontFamily: "var(--font-cormorant)", fontSize: 17, width: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${BORDER_S}` }}>
        {filled ? "✓" : roman}
      </div>
      <div style={{ flex: 1, padding: "10px 16px", background: DARK, border: `1px solid ${BORDER}`, borderLeft: "none" }}>
        <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 16, fontWeight: 400, color: "#FFF", letterSpacing: 0.4 }}>{title}</div>
        <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ─── Ornamental Divider ───────────────────────────────────────────────────────
export function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
      <span style={{ color: GOLD, fontSize: 11 }}>◆</span>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  );
}

// ─── Product Tag Style ────────────────────────────────────────────────────────
export function tagStyle(tag?: string) {
  if (tag === "Premium") return { bg: "rgba(201,168,76,0.1)", border: "rgba(201,168,76,0.35)", color: GOLD };
  if (tag === "Bestseller") return { bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.3)", color: "#34d399" };
  if (tag === "Popular") return { bg: "rgba(139,124,246,0.1)", border: "rgba(139,124,246,0.28)", color: "#a78bfa" };
  return null;
}

// ─── Input Styles ─────────────────────────────────────────────────────────────
export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 10px 9px 34px", border: `1px solid ${BORDER_S}`,
  background: "#FFF", fontFamily: "var(--font-montserrat)", fontSize: 12, color: DARK, outline: "none",
};

export const plainInputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 14px", border: `1px solid ${BORDER_S}`,
  background: "#FFF", fontFamily: "var(--font-montserrat)", fontSize: 12, color: DARK, outline: "none",
};

// suppress unused import warning — GOLD_L exported for consumers
export { GOLD_L };
