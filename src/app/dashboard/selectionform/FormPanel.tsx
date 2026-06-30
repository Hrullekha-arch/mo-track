"use client";

import { Loader2, Phone, Search, User } from "lucide-react";
import type { PastVisit } from "./data";
import {
  ROOMS, VISIT_PURPOSES, STYLES, PALETTES, DECOR_LEVELS,
  ACCENT_OPTIONS, PRIORITY_OPTIONS, TIMELINE_OPTIONS, BUDGETS,
  GOLD, DARK, CHARCOAL, WARM, BORDER_S, GOLD_L,
} from "./data";
import { SectionBar, Divider, inputStyle, plainInputStyle } from "./helpers";

type FormPanelProps = {
  phone: string; setPhone: (v: string) => void;
  customerName: string; setCustomerName: (v: string) => void;
  visitPurpose: string; setVisitPurpose: (v: string) => void;
  selectedRooms: string[]; toggleRoom: (id: string) => void;
  styleId: string; setStyleId: (v: string) => void;
  palette: string; setPalette: (v: string) => void;
  decorLevel: string; setDecorLevel: (v: string) => void;
  showAccents: boolean;
  accentElements: string[]; toggleAccent: (a: string) => void;
  priorities: string[]; togglePriority: (pr: string) => void;
  timeline: string; setTimeline: (v: string) => void;
  requirement: string; setRequirement: (v: string) => void;
  avoidText: string; setAvoidText: (v: string) => void;
  threeWords: string; setThreeWords: (v: string) => void;
  budget: string; setBudget: (v: string) => void;
  pastVisit: PastVisit | null;
  lookingUp: boolean;
  lookupCustomer: () => Promise<void>;
  requirementRef: React.Ref<HTMLTextAreaElement>;
  filled: Record<string, boolean>;
  generate: () => void;
};

export function FormPanel(p: FormPanelProps) {
  return (
    <div>
      {/* I. Client Identification */}
      <SectionBar roman="I" title="Client Identification" subtitle="Lead capture & CRM" filled={p.filled.client} />
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: WARM, marginBottom: 6 }}>WhatsApp / Mobile Number</label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Phone style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: GOLD }} />
            <input type="tel" value={p.phone} onChange={(e) => p.setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void p.lookupCustomer()} placeholder="10-digit number" style={inputStyle} />
          </div>
          <button type="button" onClick={() => void p.lookupCustomer()} disabled={p.lookingUp || p.phone.replace(/\D/g, "").length < 10}
            style={{ padding: "0 16px", background: DARK, border: `1px solid ${GOLD}`, color: GOLD, cursor: "pointer", display: "flex", alignItems: "center", opacity: p.phone.replace(/\D/g, "").length < 10 ? 0.4 : 1 }}>
            {p.lookingUp ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Search style={{ width: 14, height: 14 }} />}
          </button>
        </div>
      </div>

      {p.pastVisit && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#EFF5EE", border: "1px solid #B8D4B3", borderLeft: "3px solid #4A7C3F" }}>
          <p style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#4A7C3F", fontWeight: 600, marginBottom: 3 }}>◆ Returning Client</p>
          <p style={{ fontSize: 13, color: DARK, fontWeight: 500 }}>{p.pastVisit.name}</p>
          {p.pastVisit.lookingFor && <p style={{ fontSize: 11, color: "#2D5A27", marginTop: 2, lineHeight: 1.5 }}>Previously: {Array.isArray(p.pastVisit.lookingFor) ? p.pastVisit.lookingFor.join(", ") : p.pastVisit.lookingFor}</p>}
        </div>
      )}

      <div>
        <label style={{ display: "block", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: WARM, marginBottom: 6 }}>Client Full Name</label>
        <div style={{ position: "relative" }}>
          <User style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(107,95,82,0.5)" }} />
          <input type="text" value={p.customerName} onChange={(e) => p.setCustomerName(e.target.value)} placeholder="First & Last name (optional)" style={inputStyle} />
        </div>
      </div>

      <Divider />

      {/* II. Visit Purpose */}
      <SectionBar roman="II" title="Visit Purpose" subtitle="New home · Refresh · Specific item" filled={p.filled.purpose} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {VISIT_PURPOSES.map((v) => {
          const a = p.visitPurpose === v.id;
          return (
            <button key={v.id} type="button" onClick={() => p.setVisitPurpose(a ? "" : v.id)}
              style={{ padding: "12px 8px", border: `1px solid rgba(201,168,76,${a ? 0.7 : 0.25})`, background: a ? "rgba(201,168,76,0.07)" : "#FFF", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: GOLD, marginBottom: 4 }}>◆</div>
              <div style={{ fontSize: 11, fontWeight: a ? 600 : 400, color: a ? DARK : CHARCOAL }}>{v.label}</div>
              <div style={{ fontSize: 9, color: "rgba(107,95,82,0.55)", marginTop: 3, lineHeight: 1.4 }}>{v.desc}</div>
            </button>
          );
        })}
      </div>

      <Divider />

      {/* III. Space & Scope */}
      <SectionBar roman="III" title="Space & Scope" subtitle="Select all areas needed" filled={p.filled.scope} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {ROOMS.filter((r) => r.id !== "curtains").map((room) => {
          const a = p.selectedRooms.includes(room.id);
          return (
            <button key={room.id} type="button" onClick={() => p.toggleRoom(room.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid rgba(201,168,76,${a ? 0.55 : 0.22})`, margin: "-1px 0 0 -1px", background: a ? "rgba(201,168,76,0.06)" : "#FFF", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 14, height: 14, border: `1.5px solid ${a ? GOLD : BORDER_S}`, borderRadius: 2, flexShrink: 0, background: a ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {a && <span style={{ color: DARK, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontSize: 11, fontWeight: a ? 500 : 300, color: a ? DARK : CHARCOAL }}>{room.label}</span>
            </button>
          );
        })}
      </div>

      {/* Curtains — full-width specialty row */}
      {(() => {
        const curtainRoom = ROOMS.find((r) => r.id === "curtains")!;
        const a = p.selectedRooms.includes("curtains");
        return (
          <button type="button" onClick={() => p.toggleRoom("curtains")}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "none", borderRight: `1px solid rgba(201,168,76,${a ? 0.65 : 0.28})`, borderBottom: `1px solid rgba(201,168,76,${a ? 0.65 : 0.28})`, borderLeft: `1px solid rgba(201,168,76,${a ? 0.65 : 0.28})`, width: "100%", background: a ? "rgba(201,168,76,0.09)" : "rgba(250,246,238,0.6)", cursor: "pointer", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 14, height: 14, border: `1.5px solid ${a ? GOLD : BORDER_S}`, borderRadius: 2, flexShrink: 0, background: a ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {a && <span style={{ color: DARK, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontSize: 11, fontWeight: a ? 600 : 400, color: a ? DARK : CHARCOAL }}>{curtainRoom.label}</span>
            </div>
            <span style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: a ? GOLD : "rgba(201,168,76,0.4)", padding: "2px 8px", border: `1px solid rgba(201,168,76,${a ? 0.45 : 0.2})`, background: a ? "rgba(201,168,76,0.07)" : "transparent" }}>
              Fabric · Blinds · Hardware
            </span>
          </button>
        );
      })()}

      <Divider />

      {/* IV. Design Style */}
      <SectionBar roman="IV" title="Design Style" subtitle="Select one — helps curate precisely" filled={p.filled.style} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {STYLES.map((s) => {
          const a = p.styleId === s.id;
          return (
            <button key={s.id} type="button" onClick={() => p.setStyleId(a ? "" : s.id)}
              style={{ padding: "10px 12px", border: `1px solid rgba(201,168,76,${a ? 0.65 : 0.25})`, background: a ? "rgba(201,168,76,0.06)" : "#FFF", cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: a ? 600 : 400, color: a ? DARK : CHARCOAL }}>{s.label}</div>
              <div style={{ fontSize: 9, color: "rgba(107,95,82,0.55)", marginTop: 2 }}>{s.desc}</div>
            </button>
          );
        })}
      </div>

      <Divider />

      {/* V. Colour Palette */}
      <SectionBar roman="V" title="Colour Palette" subtitle="Closest to the client's vision" filled={p.filled.palette} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {PALETTES.map((pal) => {
          const a = p.palette === pal.id;
          return (
            <button key={pal.id} type="button" onClick={() => p.setPalette(a ? "" : pal.id)}
              style={{ padding: "12px", border: `1px solid rgba(201,168,76,${a ? 0.65 : 0.25})`, background: a ? "rgba(201,168,76,0.05)" : "#FFF", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {pal.swatches.map((sw, i) => (
                  <div key={i} style={{ width: 20, height: 20, background: sw, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 2 }} />
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: a ? 600 : 400, color: a ? DARK : CHARCOAL }}>{pal.label}</div>
              <div style={{ fontSize: 9, color: "rgba(107,95,82,0.55)", marginTop: 2 }}>{pal.desc}</div>
            </button>
          );
        })}
      </div>

      <Divider />

      {/* VI. Style Details */}
      <SectionBar roman="VI" title="Style Details" subtitle="Decorativeness & accent preferences" filled={p.filled.details} />
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 8 }}>How decorative should the space feel?</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        {DECOR_LEVELS.map((d, idx) => {
          const a = p.decorLevel === d.id;
          return (
            <button key={d.id} type="button" onClick={() => p.setDecorLevel(a ? "" : d.id)}
              style={{ padding: "10px 8px", border: `1px solid rgba(201,168,76,${a ? 0.65 : 0.22})`, margin: "0 0 0 -1px", background: a ? "rgba(201,168,76,0.07)" : "#FFF", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: a ? GOLD : "rgba(201,168,76,0.3)", marginBottom: 4, letterSpacing: -1 }}>{"◆".repeat(idx + 1)}</div>
              <div style={{ fontSize: 10, fontWeight: a ? 600 : 400, color: a ? DARK : CHARCOAL, lineHeight: 1.3 }}>{d.label}</div>
              <div style={{ fontSize: 8, color: "rgba(107,95,82,0.5)", marginTop: 2, lineHeight: 1.3 }}>{d.desc}</div>
            </button>
          );
        })}
      </div>
      {p.showAccents && (
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 8 }}>Accent & decorative details (select all that appeal)</label>
          {ACCENT_OPTIONS.map((ac) => {
            const a = p.accentElements.includes(ac);
            return (
              <button key={ac} type="button" onClick={() => p.toggleAccent(ac)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid rgba(201,168,76,${a ? 0.55 : 0.22})`, margin: "-1px 0 0 0", background: a ? "rgba(201,168,76,0.05)" : "#FFF", cursor: "pointer", textAlign: "left", width: "100%" }}>
                <div style={{ width: 14, height: 14, border: `1.5px solid ${a ? GOLD : BORDER_S}`, borderRadius: 2, flexShrink: 0, background: a ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {a && <span style={{ color: DARK, fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 11, color: a ? DARK : CHARCOAL, fontWeight: a ? 500 : 300 }}>{ac}</span>
              </button>
            );
          })}
        </div>
      )}

      <Divider />

      {/* VII. Priorities & Timeline */}
      <SectionBar roman="VII" title="Priorities & Timeline" subtitle="What matters most · When" filled={p.filled.priorities} />
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 8 }}>What matters most in the furnishings?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {PRIORITY_OPTIONS.map((pr) => {
          const a = p.priorities.includes(pr);
          return (
            <button key={pr} type="button" onClick={() => p.togglePriority(pr)}
              style={{ padding: "7px 14px", border: `1px solid rgba(201,168,76,${a ? 0.7 : 0.3})`, background: a ? "rgba(201,168,76,0.08)" : "#FFF", fontSize: 10, fontWeight: a ? 500 : 300, color: a ? DARK : WARM, letterSpacing: "0.05em", cursor: "pointer" }}>
              {pr}
            </button>
          );
        })}
      </div>
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 8 }}>Delivery / project timeline</label>
      {TIMELINE_OPTIONS.map((t) => {
        const a = p.timeline === t;
        return (
          <button key={t} type="button" onClick={() => p.setTimeline(a ? "" : t)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid rgba(201,168,76,${a ? 0.55 : 0.22})`, margin: "-1px 0 0 0", background: a ? "rgba(201,168,76,0.06)" : "#FFF", cursor: "pointer", textAlign: "left", width: "100%" }}>
            <div style={{ width: 14, height: 14, border: `1.5px solid ${a ? GOLD : BORDER_S}`, borderRadius: "50%", flexShrink: 0, background: a ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {a && <span style={{ color: DARK, fontSize: 8, fontWeight: 700 }}>●</span>}
            </div>
            <span style={{ fontSize: 11, color: a ? DARK : CHARCOAL, fontWeight: a ? 500 : 300 }}>{t}</span>
          </button>
        );
      })}

      <Divider />

      {/* VIII. Brief & Notes */}
      <SectionBar roman="VIII" title="Brief & Notes" subtitle="Budget · Requirement · Avoid · Three words" filled={p.filled.notes} />
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 8 }}>Budget expectation</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {BUDGETS.map((b) => {
          const a = p.budget === b;
          return (
            <button key={b} type="button" onClick={() => p.setBudget(a ? "" : b)}
              style={{ padding: "7px 16px", border: `1px solid rgba(201,168,76,${a ? 0.7 : 0.3})`, background: a ? "rgba(201,168,76,0.08)" : "#FFF", fontSize: 10, fontWeight: a ? 500 : 300, color: a ? DARK : WARM, letterSpacing: "0.05em", cursor: "pointer" }}>
              {b}
            </button>
          );
        })}
      </div>
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 6 }}>Specific requirement</label>
      <textarea ref={p.requirementRef} value={p.requirement} onChange={(e) => p.setRequirement(e.target.value)}
        placeholder={`"King bed with storage for 14×12 room" · "6-seater dining set"…`} rows={3}
        style={{ ...plainInputStyle, lineHeight: 1.7, resize: "vertical", marginBottom: 10 }} />
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 6 }}>What should we absolutely avoid?</label>
      <input type="text" value={p.avoidText} onChange={(e) => p.setAvoidText(e.target.value)}
        placeholder={`"No florals" · "Avoid orange tones" · "Nothing too dark"…`} style={{ ...plainInputStyle, marginBottom: 10 }} />
      <label style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: WARM, marginBottom: 6 }}>Home in three words…</label>
      <input type="text" value={p.threeWords} onChange={(e) => p.setThreeWords(e.target.value)}
        placeholder={`"Serene, Refined, Timeless" · "Bold, Dramatic, Alive"…`} style={{ ...plainInputStyle, fontStyle: "italic" }} />

      <button type="button" onClick={p.generate} disabled={p.selectedRooms.length === 0 && !p.requirement.trim()}
        style={{ width: "100%", marginTop: 20, padding: "15px", background: DARK, border: `1px solid ${GOLD}`, color: GOLD_L, fontFamily: "var(--font-cormorant)", fontSize: 20, fontWeight: 400, letterSpacing: 2, cursor: "pointer", opacity: p.selectedRooms.length === 0 && !p.requirement.trim() ? 0.4 : 1 }}>
        ◆ Generate Suggestions ◆
      </button>
    </div>
  );
}
