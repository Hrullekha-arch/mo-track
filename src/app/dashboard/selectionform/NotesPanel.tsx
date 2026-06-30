"use client";

import { STYLE_NOTE, GOLD, GOLD_L, DARK, WARM, CHARCOAL, BORDER, BORDER_S } from "./data";

type NotesPanelProps = {
  associateNotes: string; setAssociateNotes: (v: string) => void;
  leadStatus: string; setLeadStatus: (v: string) => void;
  followUpDate: string; setFollowUpDate: (v: string) => void;
  sessionTags: string[]; setSessionTags: (fn: (prev: string[]) => string[]) => void;
  interestedProducts: string[];
  styleId: string;
};

export function NotesPanel(p: NotesPanelProps) {
  return (
    <div style={{ background: "#FFF", border: `1px solid ${BORDER}` }}>
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${BORDER}`, background: "#FAF6EE" }}>
        <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, marginBottom: 4 }}>Private Associate Notes</p>
        <p style={{ fontSize: 11, color: WARM, lineHeight: 1.6 }}>Record observations, follow-up actions, or additional context for this client. Not visible to the client.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px" }}>

        {/* Left: notes textarea */}
        <div style={{ borderRight: `1px solid ${BORDER}` }}>
          <textarea value={p.associateNotes} onChange={(e) => p.setAssociateNotes(e.target.value)}
            placeholder="e.g. Client visited with spouse, very interested in velvet sofas. Budget flexible. Follow up Thursday..."
            rows={16}
            style={{ width: "100%", padding: "18px 24px", border: "none", outline: "none", fontFamily: "var(--font-montserrat)", fontSize: 12, color: DARK, lineHeight: 1.9, resize: "none", background: "#FFF", display: "block" }} />
          {p.associateNotes && (
            <div style={{ padding: "8px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 9, color: GOLD, letterSpacing: "0.1em" }}>{p.associateNotes.length} chars · {p.associateNotes.trim().split(/\s+/).length} words</span>
            </div>
          )}
        </div>

        {/* Right: meta panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Lead Status */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>Lead Status</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { id: "hot", label: "Hot Lead", color: "#dc2626", bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.3)" },
                { id: "warm", label: "Warm — Follow Up", color: "#d97706", bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.3)" },
                { id: "quote", label: "Quote Pending", color: "#7c3aed", bg: "rgba(124,58,237,0.06)", border: "rgba(124,58,237,0.3)" },
                { id: "converted", label: "Converted ✓", color: "#16a34a", bg: "rgba(22,163,74,0.06)", border: "rgba(22,163,74,0.3)" },
                { id: "cold", label: "Cold / Not Interested", color: WARM, bg: "rgba(107,95,82,0.05)", border: "rgba(107,95,82,0.2)" },
              ].map((s) => {
                const active = p.leadStatus === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => p.setLeadStatus(active ? "" : s.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${active ? s.border : "rgba(201,168,76,0.15)"}`, margin: "-1px 0 0 0", background: active ? s.bg : "#FFF", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? s.color : "rgba(107,95,82,0.2)", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: active ? 600 : 300, color: active ? s.color : WARM }}>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Follow-up date */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>Follow-up Date</p>
            <input type="date" value={p.followUpDate} onChange={(e) => p.setFollowUpDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${BORDER_S}`, background: "#FFF", fontFamily: "var(--font-montserrat)", fontSize: 11, color: DARK, outline: "none" }} />
            {p.followUpDate && (
              <p style={{ fontSize: 10, color: WARM, marginTop: 6 }}>
                Follow up: {new Date(p.followUpDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
            )}
          </div>

          {/* Session tags */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>Session Tags</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["Visited Showroom", "Spouse Present", "Saw Sample", "Budget Flexible", "Decision Maker", "Repeat Client", "Referral", "Needs Quote"].map((tag) => {
                const active = p.sessionTags.includes(tag);
                return (
                  <button key={tag} type="button"
                    onClick={() => p.setSessionTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                    style={{ padding: "4px 10px", border: `1px solid rgba(201,168,76,${active ? 0.6 : 0.2})`, background: active ? "rgba(201,168,76,0.08)" : "#FFF", fontSize: 9, color: active ? DARK : WARM, fontWeight: active ? 600 : 300, letterSpacing: "0.06em", cursor: "pointer" }}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Related items */}
          <div style={{ padding: "16px 18px", flex: 1 }}>
            <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>Related Items</p>
            {p.interestedProducts.length === 0 ? (
              <p style={{ fontSize: 10, color: "rgba(107,95,82,0.45)", fontStyle: "italic", lineHeight: 1.6 }}>
                No items starred yet. Click ★ on products in the Recommendations tab to link them here.
              </p>
            ) : (
              <div>
                {p.interestedProducts.map((name) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: `1px solid ${BORDER}`, margin: "-1px 0 0 0", background: "#FAF6EE" }}>
                    <span style={{ color: GOLD, fontSize: 10 }}>★</span>
                    <span style={{ fontSize: 10, color: CHARCOAL, lineHeight: 1.4 }}>{name}</span>
                  </div>
                ))}
                <p style={{ fontSize: 9, color: "rgba(107,95,82,0.4)", marginTop: 8, letterSpacing: "0.06em" }}>
                  {p.interestedProducts.length} item{p.interestedProducts.length !== 1 ? "s" : ""} of interest
                </p>
              </div>
            )}
          </div>

          {/* Style note */}
          {p.styleId && STYLE_NOTE[p.styleId] && (
            <div style={{ padding: "14px 18px", borderTop: `1px solid ${BORDER}`, background: "#FAF6EE" }}>
              <p style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: GOLD_L, marginBottom: 6 }}>Style Guidance</p>
              <p style={{ fontSize: 11, color: WARM, lineHeight: 1.8, fontWeight: 300 }}>{STYLE_NOTE[p.styleId]}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
