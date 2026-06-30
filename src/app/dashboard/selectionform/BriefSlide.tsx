"use client";

import { PALETTES, STYLES, STYLE_NOTE, VISIT_PURPOSES, ROOMS, GOLD, GOLD_L, DARK, BORDER, BORDER_S } from "./data";

type BriefSlideProps = {
  customerName: string;
  threeWords: string;
  briefLineItems: string[];
  palette: string;
  styleId: string;
  interestedProducts: string[];
  selectedRooms: string[];
  visitPurpose: string;
  budget: string;
  timeline: string;
  formOpen: boolean;
  tvPaused: boolean;
  tvSlide: number;
};

export function BriefSlide(p: BriefSlideProps) {
  const selPalette = PALETTES.find((pal) => pal.id === p.palette);
  const selStyle = STYLES.find((s) => s.id === p.styleId);

  return (
    <div key={`brief-${p.tvSlide}`} style={{ background: DARK, position: "relative", overflow: "hidden", animation: "tvSlideIn 0.75s cubic-bezier(0.16,1,0.3,1)" }}>

      {/* ── Multi-layer ambient glow ── */}
      <div style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: 900, height: 380, background: "radial-gradient(ellipse, rgba(201,168,76,0.13) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -80, left: "20%", width: 500, height: 260, background: "radial-gradient(ellipse, rgba(201,168,76,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: 280, height: "100%", background: "linear-gradient(90deg, rgba(201,168,76,0.04) 0%, transparent 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, right: 0, width: 280, height: "100%", background: "linear-gradient(270deg, rgba(201,168,76,0.04) 0%, transparent 100%)", pointerEvents: "none" }} />

      {/* Top shimmer — 3px */}
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 20%, ${GOLD_L} 50%, ${GOLD} 80%, transparent 100%)` }} />

      {/* ── Letterhead ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 56px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: GOLD, fontSize: 7, opacity: 0.6 }}>◆</span>
          <span style={{ fontSize: 7, letterSpacing: "0.62em", textTransform: "uppercase", color: "rgba(201,168,76,0.6)" }}>MO Designs · Gurugram Showroom</span>
          <span style={{ color: GOLD, fontSize: 7, opacity: 0.6 }}>◆</span>
        </div>
        {!p.formOpen && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 7, letterSpacing: "0.25em", textTransform: "uppercase", color: p.tvPaused ? "rgba(255,255,255,0.18)" : GOLD }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.tvPaused ? "rgba(255,255,255,0.15)" : GOLD, display: "inline-block", boxShadow: p.tvPaused ? "none" : `0 0 10px ${GOLD}` }} />
            {p.tvPaused ? "Paused" : "Live Preview"}
          </div>
        )}
        <div style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
          {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* ── HERO ── */}
      <div style={{ padding: "56px 56px 44px", textAlign: "center", position: "relative", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ position: "absolute", top: 18, left: 36, fontSize: 9, color: "rgba(201,168,76,0.28)", letterSpacing: 5 }}>◆ ◆</div>
        <div style={{ position: "absolute", top: 18, right: 36, fontSize: 9, color: "rgba(201,168,76,0.28)", letterSpacing: 5 }}>◆ ◆</div>

        <div style={{ fontSize: 7, letterSpacing: "0.72em", textTransform: "uppercase", color: "rgba(201,168,76,0.45)", marginBottom: 20 }}>Curated Style Brief</div>

        <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 88, fontWeight: 300, color: "#FFF", letterSpacing: 6, lineHeight: 0.95, textShadow: "0 0 80px rgba(201,168,76,0.18)" }}>
          {p.customerName || "Guest"}
        </div>

        {p.threeWords && (
          <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 26, fontStyle: "italic", color: GOLD_L, letterSpacing: 2, marginTop: 18, textShadow: "0 0 40px rgba(232,201,122,0.3)" }}>
            &ldquo;{p.threeWords}&rdquo;
          </div>
        )}

        {/* Triple ornamental rule */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, margin: "28px auto 24px", maxWidth: 560 }}>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${BORDER_S})` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: GOLD, fontSize: 7, opacity: 0.45 }}>◆</span>
            <span style={{ color: GOLD_L, fontSize: 14 }}>◆</span>
            <span style={{ color: GOLD, fontSize: 7, opacity: 0.45 }}>◆</span>
          </div>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${BORDER_S}, transparent)` }} />
        </div>

        {/* Badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {p.visitPurpose && <span style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", padding: "5px 18px", border: `1px solid ${BORDER_S}`, color: GOLD_L, background: "rgba(201,168,76,0.07)" }}>{VISIT_PURPOSES.find((v) => v.id === p.visitPurpose)?.label}</span>}
          {selStyle && <span style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", padding: "5px 18px", border: `1px solid ${BORDER_S}`, color: GOLD_L, background: "rgba(201,168,76,0.07)" }}>{selStyle.label}</span>}
          {selPalette && <span style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", padding: "5px 18px", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.03)" }}>{selPalette.label}</span>}
          {p.budget && <span style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", padding: "5px 18px", border: "1px solid rgba(52,211,153,0.32)", color: "#34d399", background: "rgba(52,211,153,0.05)" }}>{p.budget}</span>}
          {p.timeline && <span style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", padding: "5px 18px", border: "1px solid rgba(139,124,246,0.32)", color: "#a78bfa", background: "rgba(139,124,246,0.05)" }}>{p.timeline}</span>}
        </div>
      </div>

      {/* ── Body: 3-column ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 3px 1fr 3px 1fr" }}>

        {/* LEFT — Style Profile */}
        <div style={{ padding: "38px 44px 40px" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.55em", textTransform: "uppercase", color: GOLD, marginBottom: 26, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />Style Profile<div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>
          {p.briefLineItems.length === 0
            ? <p style={{ fontFamily: "var(--font-cormorant)", fontSize: 17, fontStyle: "italic", color: "rgba(255,255,255,0.2)" }}>No preferences captured yet.</p>
            : p.briefLineItems.map((line, i) => {
              const colonIdx = line.indexOf(": ");
              const lbl = colonIdx > -1 ? line.slice(0, colonIdx) : "";
              const val = colonIdx > -1 ? line.slice(colonIdx + 2) : line;
              return (
                <div key={i} style={{ padding: "13px 0", borderBottom: "1px solid rgba(201,168,76,0.08)" }}>
                  <div style={{ fontSize: 7, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(201,168,76,0.45)", marginBottom: 5 }}>{lbl}</div>
                  <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 18, color: "rgba(255,255,255,0.9)", lineHeight: 1.4 }}>{val}</div>
                </div>
              );
            })}
        </div>

        {/* Divider 1 */}
        <div style={{ background: `linear-gradient(180deg, transparent 0%, ${BORDER_S} 20%, ${BORDER_S} 80%, transparent 100%)` }} />

        {/* CENTRE — Colour Palette + Spaces */}
        <div style={{ padding: "38px 44px 40px" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.55em", textTransform: "uppercase", color: GOLD, marginBottom: 26, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />Colour Direction<div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>
          {selPalette ? (
            <div>
              <div style={{ display: "flex", height: 110, overflow: "hidden", border: `1px solid ${BORDER}`, marginBottom: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
                {selPalette.swatches.map((sw, i) => (
                  <div key={i} style={{ flex: 1, background: sw, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 50%)" }} />
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 22, fontStyle: "italic", color: "#FFF", letterSpacing: 0.5, marginBottom: 6 }}>{selPalette.label}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 20 }}>{selPalette.desc}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {selPalette.swatches.map((sw, i) => (
                  <div key={i} style={{ flex: 1, height: 6, background: sw, border: "1px solid rgba(255,255,255,0.1)" }} />
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-cormorant)", fontSize: 17, fontStyle: "italic", color: "rgba(255,255,255,0.2)" }}>No palette selected yet.</p>
          )}

          {p.selectedRooms.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 7, letterSpacing: "0.55em", textTransform: "uppercase", color: GOLD, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: BORDER }} />Spaces<div style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.selectedRooms.map((id) => {
                  const room = ROOMS.find((r) => r.id === id);
                  return room ? (
                    <div key={id} style={{ padding: "5px 14px", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)", fontSize: 9, letterSpacing: "0.08em", background: "rgba(255,255,255,0.025)" }}>
                      {room.label}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

        {/* Divider 2 */}
        <div style={{ background: `linear-gradient(180deg, transparent 0%, ${BORDER_S} 20%, ${BORDER_S} 80%, transparent 100%)` }} />

        {/* RIGHT — Guidance + Items of Interest */}
        <div style={{ padding: "38px 44px 40px" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.55em", textTransform: "uppercase", color: GOLD, marginBottom: 26, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />Associate Guidance<div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          {p.styleId && STYLE_NOTE[p.styleId] ? (
            <div>
              <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 96, color: GOLD, lineHeight: 0.7, marginBottom: 8, opacity: 0.18, userSelect: "none" }}>&ldquo;</div>
              <div style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 22, marginTop: -12 }}>
                <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 18, fontStyle: "italic", color: "rgba(255,255,255,0.82)", lineHeight: 1.85 }}>{STYLE_NOTE[p.styleId]}</div>
              </div>
              {selStyle && (
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ height: 1, width: 32, background: BORDER_S }} />
                  <span style={{ fontSize: 8, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, opacity: 0.7 }}>{selStyle.label} Direction</span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-cormorant)", fontSize: 17, fontStyle: "italic", color: "rgba(255,255,255,0.2)" }}>No style selected yet.</p>
          )}

          {p.interestedProducts.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 7, letterSpacing: "0.55em", textTransform: "uppercase", color: GOLD, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: BORDER }} />Items of Interest<div style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {p.interestedProducts.slice(0, 6).map((name) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(201,168,76,0.08)" }}>
                    <span style={{ color: GOLD, fontSize: 9, flexShrink: 0 }}>★</span>
                    <span style={{ fontFamily: "var(--font-cormorant)", fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.3 }}>{name}</span>
                  </div>
                ))}
                {p.interestedProducts.length > 6 && (
                  <div style={{ fontSize: 8, color: "rgba(201,168,76,0.4)", marginTop: 8, letterSpacing: "0.15em" }}>+{p.interestedProducts.length - 6} more items</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom shimmer — 3px */}
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 20%, ${GOLD_L} 50%, ${GOLD} 80%, transparent 100%)` }} />
    </div>
  );
}
