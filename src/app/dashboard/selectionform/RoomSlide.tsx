"use client";

import type { Room } from "./data";
import { PALETTES, STYLE_NOTE, GOLD, GOLD_L, DARK, BORDER, BORDER_S } from "./data";
import { tagStyle } from "./helpers";

type RoomSlideProps = {
  tvRoom: Room;
  tvSlide: number;
  matchedRooms: Room[];
  interestedProducts: string[];
  palette: string;
  styleId: string;
  tvPaused: boolean;
  toggleInterested: (name: string) => void;
};

export function RoomSlide(p: RoomSlideProps) {
  const intCount = p.interestedProducts.filter((n) => p.tvRoom.products.find((prod) => prod.name === n)).length;
  const selPaletteData = PALETTES.find((pal) => pal.id === p.palette);

  return (
    <div key={`room-${p.tvSlide}`} style={{ background: DARK, position: "relative", overflow: "hidden", animation: "tvSlideIn 0.75s cubic-bezier(0.16,1,0.3,1)" }}>
      {/* Background glow */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 360, height: "100%", background: "linear-gradient(90deg, rgba(201,168,76,0.04) 0%, transparent 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -80, right: "15%", width: 500, height: 300, background: "radial-gradient(ellipse, rgba(201,168,76,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Top shimmer */}
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 25%, ${GOLD_L} 50%, ${GOLD} 75%, transparent 100%)` }} />

      {/* Letterhead */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 52px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 8, letterSpacing: "0.5em", textTransform: "uppercase", color: "rgba(201,168,76,0.5)" }}>
          <span>◆</span> MO Designs · Gurugram Showroom <span>◆</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: p.tvPaused ? "rgba(255,255,255,0.2)" : GOLD }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.tvPaused ? "rgba(255,255,255,0.15)" : GOLD, display: "inline-block", boxShadow: p.tvPaused ? "none" : `0 0 10px ${GOLD}` }} />
          {p.tvPaused ? "Paused" : "Auto · Advance"}
        </div>
      </div>

      {/* Split body */}
      <div style={{ display: "grid", gridTemplateColumns: "310px 1fr" }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ borderRight: `1px solid ${BORDER}`, padding: "36px 32px 36px 52px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 520, background: "linear-gradient(175deg, rgba(201,168,76,0.05) 0%, transparent 60%)" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.45em", textTransform: "uppercase", color: "rgba(201,168,76,0.35)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-cormorant)", fontSize: 13, color: GOLD }}>0{p.tvSlide}</span>
              <span style={{ color: BORDER }}>—</span>
              <span>of {p.matchedRooms.length}</span>
            </div>
            <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 58, fontWeight: 300, color: "#FFF", letterSpacing: 2, lineHeight: 1.05, marginBottom: 18 }}>
              {p.tvRoom.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ height: 1, width: 40, background: BORDER_S }} />
              <span style={{ color: GOLD, fontSize: 8, opacity: 0.6 }}>◆</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-cormorant)", fontSize: 32, color: GOLD, fontWeight: 300, lineHeight: 1 }}>{p.tvRoom.products.length}</span>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(201,168,76,0.5)" }}>Curated</div>
                  <div style={{ fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(201,168,76,0.5)" }}>Products</div>
                </div>
              </div>
              {intCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ fontSize: 9, color: "#34d399" }}>★</span>
                  <span style={{ fontSize: 9, color: "#34d399", letterSpacing: "0.15em", textTransform: "uppercase" }}>{intCount} Starred</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: palette + style note */}
          <div>
            {selPaletteData && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 7, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(201,168,76,0.35)", marginBottom: 10 }}>Colour Direction</div>
                <div style={{ display: "flex", height: 8, overflow: "hidden", marginBottom: 8 }}>
                  {selPaletteData.swatches.map((sw, i) => (
                    <div key={i} style={{ flex: 1, background: sw }} />
                  ))}
                </div>
                <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>{selPaletteData.label}</div>
              </div>
            )}
            {p.styleId && STYLE_NOTE[p.styleId] && (
              <div style={{ borderLeft: "2px solid rgba(201,168,76,0.3)", paddingLeft: 14 }}>
                <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>
                  {STYLE_NOTE[p.styleId].length > 90 ? STYLE_NOTE[p.styleId].substring(0, 90) + "…" : STYLE_NOTE[p.styleId]}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: product grid — category-grouped for curtains, flat for others ── */}
        {p.tvRoom.id === "curtains" ? (() => {
          const cats = Array.from(new Set(p.tvRoom.products.map((prod) => prod.cat)));
          return (
            <div style={{ overflowY: "auto" }}>
              {cats.map((cat) => {
                const catProds = p.tvRoom.products.filter((prod) => prod.cat === cat);
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 28px", borderBottom: "1px solid rgba(201,168,76,0.12)", borderTop: "1px solid rgba(201,168,76,0.08)", background: "rgba(201,168,76,0.04)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
                      <span style={{ fontSize: 7, letterSpacing: "0.4em", textTransform: "uppercase", color: GOLD }}>{cat}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                      {catProds.map((product, ci) => {
                        const ts = tagStyle(product.tag);
                        const interested = p.interestedProducts.includes(product.name);
                        return (
                          <button key={product.name} type="button" onClick={() => p.toggleInterested(product.name)}
                            style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "18px 22px", minHeight: 80, border: `1px solid rgba(201,168,76,${interested ? 0.52 : 0.09})`, margin: "-1px 0 0 -1px", background: interested ? "linear-gradient(135deg, rgba(201,168,76,0.13) 0%, rgba(201,168,76,0.05) 100%)" : "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.007) 100%)", cursor: "pointer", textAlign: "left" }}>
                            <div style={{ width: 32, height: 32, flexShrink: 0, marginTop: 2, background: interested ? GOLD : "transparent", border: `1.5px solid ${interested ? GOLD : "rgba(201,168,76,0.32)"}`, color: interested ? DARK : GOLD, fontSize: interested ? 13 : 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {interested ? "★" : ci + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                                <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 17, fontStyle: interested ? "italic" : "normal", color: interested ? GOLD_L : "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{product.name}</div>
                                {ts && <span style={{ flexShrink: 0, fontSize: 7, padding: "2px 7px", background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginTop: 3 }}>{product.tag}</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, alignContent: "start" }}>
          {p.tvRoom.products.map((product, i) => {
            const ts = tagStyle(product.tag);
            const interested = p.interestedProducts.includes(product.name);
            return (
              <button key={product.name} type="button" onClick={() => p.toggleInterested(product.name)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 16,
                  padding: "24px 28px", minHeight: 114,
                  border: `1px solid rgba(201,168,76,${interested ? 0.52 : 0.09})`,
                  margin: "-1px 0 0 -1px",
                  background: interested
                    ? "linear-gradient(135deg, rgba(201,168,76,0.13) 0%, rgba(201,168,76,0.05) 100%)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.007) 100%)",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div style={{
                  width: 40, height: 40, flexShrink: 0, marginTop: 3,
                  background: interested ? GOLD : "transparent",
                  border: `1.5px solid ${interested ? GOLD : "rgba(201,168,76,0.32)"}`,
                  color: interested ? DARK : GOLD,
                  fontSize: interested ? 16 : 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {interested ? "★" : i + 1}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-cormorant)", fontSize: 21, fontStyle: interested ? "italic" : "normal", color: interested ? GOLD_L : "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>
                      {product.name}
                    </div>
                    {ts && (
                      <span style={{ flexShrink: 0, fontSize: 7, padding: "3px 9px", background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>
                        {product.tag}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 20, height: 1, background: interested ? "rgba(201,168,76,0.4)" : "rgba(201,168,76,0.15)" }} />
                    <div style={{ fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: interested ? "rgba(201,168,76,0.65)" : "rgba(201,168,76,0.28)" }}>
                      {product.cat}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Bottom shimmer */}
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 25%, ${GOLD_L} 50%, ${GOLD} 75%, transparent 100%)` }} />
    </div>
  );
}
