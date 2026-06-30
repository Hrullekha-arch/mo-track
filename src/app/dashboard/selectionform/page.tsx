"use client";

import { useEffect, useRef, useState } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

import {
  ROOMS, VISIT_PURPOSES, PALETTES, STYLES, STYLE_NOTE,
  GOLD, GOLD_L, DARK, DARK_MID, CHARCOAL, WARM, BORDER, BORDER_S,
  type Room, type PastVisit,
} from "./data";
import { tagStyle } from "./helpers";
import { openPrintWindow } from "./printBrief";
import { FormPanel } from "./FormPanel";
import { BriefSlide } from "./BriefSlide";
import { RoomSlide } from "./RoomSlide";
import { NotesPanel } from "./NotesPanel";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-montserrat" });

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CustomerRequirementsPage() {
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [styleId, setStyleId] = useState("");
  const [palette, setPalette] = useState("");
  const [decorLevel, setDecorLevel] = useState("");
  const [accentElements, setAccentElements] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [timeline, setTimeline] = useState("");
  const [requirement, setRequirement] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [threeWords, setThreeWords] = useState("");
  const [budget, setBudget] = useState("");

  const [pastVisit, setPastVisit] = useState<PastVisit | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchedRooms, setMatchedRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [rightTab, setRightTab] = useState<"products" | "brief" | "notes">("products");
  const [associateNotes, setAssociateNotes] = useState("");
  const [formOpen, setFormOpen] = useState(true);
  const [leadStatus, setLeadStatus] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [sessionTags, setSessionTags] = useState<string[]>([]);
  const [interestedProducts, setInterestedProducts] = useState<string[]>([]);
  const [tvSlide, setTvSlide] = useState(0);
  const [tvPaused, setTvPaused] = useState(false);

  const requirementRef = useRef<HTMLTextAreaElement>(null);

  const toggleRoom = (id: string) => setSelectedRooms((p) => p.includes(id) ? p.filter((r) => r !== id) : [...p, id]);
  const toggleAccent = (a: string) => setAccentElements((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);
  const togglePriority = (pr: string) => setPriorities((p) => p.includes(pr) ? p.filter((x) => x !== pr) : [...p, pr]);
  const toggleInterested = (name: string) => setInterestedProducts((p) => p.includes(name) ? p.filter((x) => x !== name) : [...p, name]);

  const lookupCustomer = async () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return;
    setLookingUp(true); setPastVisit(null);
    try {
      const results = await Promise.all([
        getDocs(query(collection(db, "Walkin_Customer"), where("mobileLast10", "==", clean.slice(-10)), limit(1))),
        getDocs(query(collection(db, "Walkin_Customer"), where("mobileNormalized", "==", clean), limit(1))),
        getDocs(query(collection(db, "Walkin_Customer"), where("mobile", "==", phone.trim()), limit(1))),
      ]);
      const found = results.flatMap((s) => s.docs).find(Boolean);
      if (found) { const d = found.data() as PastVisit; setPastVisit(d); if (!customerName) setCustomerName(d.name || ""); }
    } catch { /* silent */ } finally { setLookingUp(false); }
  };

  const briefLines = () => {
    const lines: string[] = [];
    if (visitPurpose) lines.push(`Purpose: ${VISIT_PURPOSES.find((v) => v.id === visitPurpose)?.label}`);
    if (selectedRooms.length) lines.push(`Spaces: ${selectedRooms.map((id) => ROOMS.find((r) => r.id === id)?.label).filter(Boolean).join(", ")}`);
    if (styleId) lines.push(`Style: ${STYLES.find((s) => s.id === styleId)?.label} — ${STYLE_NOTE[styleId]}`);
    if (palette) lines.push(`Palette: ${PALETTES.find((p) => p.id === palette)?.label}`);
    if (decorLevel) lines.push(`Decorativeness: ${["Very Calm", "Subtly Decorative", "Stylish", "Maximally Rich"][+decorLevel - 1]}`);
    if (accentElements.length) lines.push(`Accent elements: ${accentElements.join(", ")}`);
    if (priorities.length) lines.push(`Priorities: ${priorities.join(", ")}`);
    if (budget) lines.push(`Budget: ${budget}`);
    if (timeline) lines.push(`Timeline: ${timeline}`);
    if (requirement) lines.push(`Specific requirement: "${requirement}"`);
    if (avoidText) lines.push(`Avoid: "${avoidText}"`);
    if (threeWords) lines.push(`Home in three words: "${threeWords}"`);
    if (interestedProducts.length) lines.push(`Interested in: ${interestedProducts.join(", ")}`);
    return lines;
  };

  const generate = () => {
    const text = (requirement + " " + selectedRooms.join(" ")).toLowerCase();
    let matched: Room[] = selectedRooms.length ? ROOMS.filter((r) => selectedRooms.includes(r.id)) : [];
    ROOMS.forEach((r) => { if (!matched.find((m) => m.id === r.id) && r.keywords.some((kw) => text.includes(kw))) matched.push(r); });
    if (!matched.length) matched = ROOMS.slice(0, 3);
    setMatchedRooms(matched); setActiveRoomId(matched[0]?.id ?? "");
    setRightTab("brief"); setSubmitted(true); setFormOpen(false);
    setTvSlide(0); setTvPaused(false);
  };

  const reset = () => {
    setSubmitted(false); setMatchedRooms([]); setActiveRoomId("");
    setVisitPurpose(""); setSelectedRooms([]); setStyleId(""); setPalette("");
    setDecorLevel(""); setAccentElements([]); setPriorities([]); setTimeline("");
    setRequirement(""); setAvoidText(""); setThreeWords(""); setBudget("");
    setInterestedProducts([]); setAssociateNotes("");
    setLeadStatus(""); setFollowUpDate(""); setSessionTags([]);
    setFormOpen(true);
    setTimeout(() => requirementRef.current?.focus(), 50);
  };

  const sendToWhatsApp = () => {
    const clean = phone.replace(/\D/g, "");
    if (!clean || clean.length < 10) return;
    const waNum = clean.startsWith("91") ? clean : "91" + clean.slice(-10);
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const leadStatusLabel: Record<string, string> = {
      hot: "🔥 Hot Lead", warm: "🟡 Warm — Follow Up", quote: "🟣 Quote Pending",
      converted: "✅ Converted", cold: "❄️ Cold / Not Interested",
    };
    const lines: string[] = [];
    lines.push(`✨ *MO Designs — Style Brief*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`*Client:* ${customerName || "Guest"}`);
    if (phone) lines.push(`*Mobile:* ${phone}`);
    lines.push(`*Date:* ${dateStr}`);
    lines.push(`\n📋 *STYLE PROFILE*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    briefLines().forEach((l) => lines.push(`◆ ${l}`));
    if (threeWords) lines.push(`◆ Home in three words: _"${threeWords}"_`);
    if (matchedRooms.length) {
      lines.push(`\n🛋️ *PRODUCT RECOMMENDATIONS*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      matchedRooms.forEach((room) => {
        lines.push(`\n*${room.label}*`);
        room.products.forEach((prod, i) => {
          const star = interestedProducts.includes(prod.name) ? "★ " : "";
          lines.push(`  ${i + 1}. ${star}${prod.name}${prod.tag ? ` _(${prod.tag})_` : ""}`);
        });
      });
    }
    if (interestedProducts.length) {
      lines.push(`\n★ *ITEMS OF INTEREST*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      interestedProducts.forEach((name) => lines.push(`  • ${name}`));
    }
    const hasNotes = leadStatus || followUpDate || sessionTags.length || associateNotes;
    if (hasNotes) {
      lines.push(`\n📝 *SESSION NOTES*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      if (leadStatus && leadStatusLabel[leadStatus]) lines.push(`*Status:* ${leadStatusLabel[leadStatus]}`);
      if (followUpDate) lines.push(`*Follow-up:* ${new Date(followUpDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`);
      if (sessionTags.length) lines.push(`*Tags:* ${sessionTags.join(" · ")}`);
      if (associateNotes) lines.push(`\n_${associateNotes}_`);
    }
    lines.push(`\n_Thank you for visiting MO Designs, Gurugram_ 🏡`);
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  const TV_INTERVAL = 7000;
  const tvTotalSlides = matchedRooms.length + 1;

  useEffect(() => {
    if (!submitted || formOpen || tvPaused || tvTotalSlides <= 1) return;
    const timer = setInterval(() => setTvSlide((prev) => (prev + 1) % tvTotalSlides), TV_INTERVAL);
    return () => clearInterval(timer);
  }, [submitted, formOpen, tvPaused, tvTotalSlides]);

  const showAccents = ["classic", "luxury", "deco"].includes(styleId);
  const activeRoom = matchedRooms.find((r) => r.id === activeRoomId);
  const filled = {
    client: !!(customerName || phone), purpose: !!visitPurpose, scope: selectedRooms.length > 0,
    style: !!styleId, palette: !!palette, details: !!decorLevel,
    priorities: priorities.length > 0, notes: !!(requirement || budget),
  };

  return (
    <div className={`${cormorant.variable} ${montserrat.variable} min-h-screen`}
      style={{ background: "#FAF6EE", fontFamily: "var(--font-montserrat)", color: DARK, fontWeight: 300 }}>

      {/* ── Header ── */}
      <header style={{ background: DARK, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 900, height: 320, background: "radial-gradient(ellipse, rgba(201,168,76,0.11) 0%, transparent 68%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, left: -60, width: 340, height: "100%", background: "linear-gradient(90deg, rgba(201,168,76,0.045) 0%, transparent 100%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, right: -60, width: 340, height: "100%", background: "linear-gradient(270deg, rgba(201,168,76,0.045) 0%, transparent 100%)", pointerEvents: "none" }} />
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 25%, ${GOLD_L} 50%, ${GOLD} 75%, transparent 100%)` }} />
        <div style={{ position: "absolute", top: 10, left: 28, fontSize: 10, color: "rgba(201,168,76,0.35)", letterSpacing: 3, pointerEvents: "none" }}>◆ ◆</div>
        <div style={{ position: "absolute", top: 10, right: 28, fontSize: 10, color: "rgba(201,168,76,0.35)", letterSpacing: 3, pointerEvents: "none" }}>◆ ◆</div>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "52px 40px 44px", textAlign: "center", position: "relative" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.72em", color: GOLD, textTransform: "uppercase", marginBottom: 22, opacity: 0.65 }}>MO Designs · Gurugram Showroom</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: 680, margin: "0 auto 28px" }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${BORDER_S})` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: GOLD, fontSize: 7, opacity: 0.45 }}>◆</span>
              <span style={{ color: GOLD, fontSize: 14 }}>◆</span>
              <span style={{ color: GOLD, fontSize: 7, opacity: 0.45 }}>◆</span>
            </div>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${BORDER_S}, transparent)` }} />
          </div>
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: 64, fontWeight: 300, color: "#FFF", letterSpacing: 3, lineHeight: 1.05, marginBottom: 0 }}>
            Client{" "}
            <em style={{ color: GOLD_L, fontStyle: "italic", textShadow: "0 0 60px rgba(232,201,122,0.35)" }}>Style &amp; Requirements</em>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 20, maxWidth: 440, margin: "22px auto 20px" }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, rgba(201,168,76,0.3))` }} />
            <span style={{ color: GOLD, fontSize: 8, opacity: 0.5, letterSpacing: 6 }}>◆ ◆ ◆</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, rgba(201,168,76,0.3), transparent)` }} />
          </div>
          <p style={{ fontSize: 8, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
            Unified Intake &nbsp;·&nbsp; All Product Categories &nbsp;·&nbsp; Conditional Logic Architecture
          </p>
        </div>
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${GOLD} 25%, ${GOLD_L} 50%, ${GOLD} 75%, transparent 100%)` }} />
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 40px 60px" }}>
        <div style={formOpen ? { display: "grid", gap: 28, gridTemplateColumns: "400px 1fr" } : {}}>

          {/* ══ LEFT — Form ══ */}
          {formOpen && (
            <FormPanel
              phone={phone} setPhone={setPhone}
              customerName={customerName} setCustomerName={setCustomerName}
              visitPurpose={visitPurpose} setVisitPurpose={setVisitPurpose}
              selectedRooms={selectedRooms} toggleRoom={toggleRoom}
              styleId={styleId} setStyleId={setStyleId}
              palette={palette} setPalette={setPalette}
              decorLevel={decorLevel} setDecorLevel={setDecorLevel}
              showAccents={showAccents}
              accentElements={accentElements} toggleAccent={toggleAccent}
              priorities={priorities} togglePriority={togglePriority}
              timeline={timeline} setTimeline={setTimeline}
              requirement={requirement} setRequirement={setRequirement}
              avoidText={avoidText} setAvoidText={setAvoidText}
              threeWords={threeWords} setThreeWords={setThreeWords}
              budget={budget} setBudget={setBudget}
              pastVisit={pastVisit} lookingUp={lookingUp} lookupCustomer={lookupCustomer}
              requirementRef={requirementRef} filled={filled} generate={generate}
            />
          )}

          {/* ══ RIGHT — Results ══ */}
          <div style={!formOpen ? { maxWidth: 1160, margin: "0 auto" } : {}}>
            {!submitted ? (
              <div style={{ minHeight: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", background: "#FAF6EE", border: `1px solid ${BORDER}`, padding: 60 }}>
                <div style={{ color: GOLD, fontSize: 32, marginBottom: 20 }}>◆</div>
                <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: 32, fontWeight: 300, color: DARK, letterSpacing: 1 }}>Awaiting Client Brief</h2>
                <p style={{ marginTop: 14, fontSize: 12, color: WARM, lineHeight: 1.9, maxWidth: 320, fontWeight: 300 }}>
                  Complete the form and press <em style={{ fontFamily: "var(--font-cormorant)", fontSize: 14, color: DARK }}>Generate Suggestions</em> to receive curated product recommendations.
                </p>
                <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  {["Select rooms → curated product list", "Style profile → tailored recommendations", "Click any product to mark as interested", "Style Brief tab → full client profile summary"].map((tip) => (
                    <div key={tip} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: "rgba(107,95,82,0.55)" }}>
                      <span style={{ color: GOLD, fontSize: 8 }}>◆</span>{tip}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {/* Summary bar */}
                <div style={{ background: DARK_MID, border: `1px solid ${GOLD}`, borderLeft: `4px solid ${GOLD}`, padding: "16px 22px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                    <div>
                      <p style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD }}>Client Brief</p>
                      <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: 26, fontWeight: 300, color: "#FFF", marginTop: 4, letterSpacing: 0.5 }}>
                        {customerName || "Unidentified Client"}
                        {threeWords && <em style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginLeft: 12, fontStyle: "italic" }}>"{threeWords}"</em>}
                      </h2>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                        {visitPurpose && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 10px", background: "rgba(201,168,76,0.1)", border: `1px solid ${BORDER_S}`, color: GOLD_L }}>{VISIT_PURPOSES.find((v) => v.id === visitPurpose)?.label}</span>}
                        {styleId && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 10px", background: "rgba(201,168,76,0.1)", border: `1px solid ${BORDER_S}`, color: GOLD_L }}>{STYLES.find((s) => s.id === styleId)?.label}</span>}
                        {palette && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}>{PALETTES.find((p) => p.id === palette)?.label}</span>}
                        {budget && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 10px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}>{budget}</span>}
                        {timeline && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 10px", background: "rgba(139,124,246,0.08)", border: "1px solid rgba(139,124,246,0.25)", color: "#a78bfa" }}>{timeline}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                      {pastVisit && (
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 9, color: "#4A7C3F", letterSpacing: "0.1em", textTransform: "uppercase" }}>◆ Returning</p>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5, maxWidth: 180 }}>
                            {pastVisit.lookingFor ? (Array.isArray(pastVisit.lookingFor) ? pastVisit.lookingFor.join(", ") : pastVisit.lookingFor) : "Previous visit on record"}
                          </p>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                        <button type="button" onClick={sendToWhatsApp} disabled={phone.replace(/\D/g, "").length < 10}
                          style={{ padding: "9px 20px", background: phone.replace(/\D/g, "").length >= 10 ? "#25d366" : "rgba(37,211,102,0.08)", border: `1px solid ${phone.replace(/\D/g, "").length >= 10 ? "#25d366" : "rgba(37,211,102,0.25)"}`, color: phone.replace(/\D/g, "").length >= 10 ? "#000" : "rgba(37,211,102,0.4)", cursor: phone.replace(/\D/g, "").length >= 10 ? "pointer" : "not-allowed", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, opacity: phone.replace(/\D/g, "").length < 10 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14 }}>💬</span>
                          {phone.replace(/\D/g, "").length >= 10 ? `Send to WhatsApp · ${phone.replace(/\D/g, "").slice(-10)}` : "Send to WhatsApp (enter phone first)"}
                        </button>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => openPrintWindow({ customerName, phone, styleId, palette, visitPurpose, budget, timeline, threeWords, matchedRooms, selectedRooms, interestedProducts, associateNotes, leadStatus, followUpDate, sessionTags, briefLineItems: briefLines() })}
                            style={{ padding: "5px 12px", background: "rgba(201,168,76,0.08)", border: `1px solid ${BORDER_S}`, color: GOLD_L, cursor: "pointer", fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                            📄 Print PDF
                          </button>
                          <button type="button" onClick={() => setFormOpen((v) => !v)}
                            style={{ padding: "5px 12px", background: "transparent", border: `1px solid ${BORDER_S}`, color: GOLD_L, cursor: "pointer", fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                            {formOpen ? "◀ Hide" : "✎ Edit"}
                          </button>
                          <button type="button" onClick={reset}
                            style={{ padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                            ↺ New
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <style>{`
                  @keyframes tvSlideIn {
                    from { opacity: 0; transform: translateY(18px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes tvProgress {
                    from { transform: scaleX(0); }
                    to   { transform: scaleX(1); }
                  }
                `}</style>

                {/* Tab nav — form mode only */}
                {formOpen && (
                  <div style={{ display: "flex", background: DARK, borderBottom: `1px solid ${BORDER}` }}>
                    {(["products", "brief", "notes"] as const).map((tab) => {
                      const labels = { products: "Product Recommendations", brief: "Style Brief", notes: "Associate Notes" };
                      const isActive = rightTab === tab;
                      return (
                        <button key={tab} type="button" onClick={() => setRightTab(tab)}
                          style={{ flex: 1, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: isActive ? GOLD_L : "rgba(255,255,255,0.35)", borderBottom: `2px solid ${isActive ? GOLD : "transparent"}` }}>
                          {labels[tab]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Products tab */}
                {formOpen && rightTab === "products" && (
                  <div style={{ display: "flex" }}>
                    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, width: 148 }}>
                      {matchedRooms.map((room) => {
                        const isActive = activeRoomId === room.id;
                        return (
                          <button key={room.id} type="button" onClick={() => setActiveRoomId(room.id)}
                            style={{ padding: "11px 14px", border: `1px solid rgba(201,168,76,${isActive ? 0.55 : 0.2})`, borderLeft: `3px solid ${isActive ? GOLD : "transparent"}`, background: isActive ? "rgba(201,168,76,0.06)" : "#FFF", margin: "-1px 0 0 0", textAlign: "left", fontSize: 10, fontWeight: isActive ? 600 : 300, color: isActive ? DARK : WARM, letterSpacing: "0.06em", cursor: "pointer" }}>
                            {room.label}
                          </button>
                        );
                      })}
                      {interestedProducts.length > 0 && (
                        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(201,168,76,0.05)", border: `1px solid ${BORDER}` }}>
                          <p style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: GOLD, marginBottom: 6 }}>★ Interested</p>
                          {interestedProducts.map((name) => <p key={name} style={{ fontSize: 9, color: CHARCOAL, marginBottom: 3, lineHeight: 1.4 }}>◆ {name}</p>)}
                        </div>
                      )}
                    </div>
                    {activeRoom && (
                      <div style={{ flex: 1 }}>
                        <div style={{ background: DARK_MID, border: "1px solid rgba(201,168,76,0.35)", borderLeft: "none", padding: "14px 20px" }}>
                          <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD }}>Selected Space</p>
                          <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: 22, fontWeight: 300, color: "#FFF", marginTop: 3, letterSpacing: 0.5 }}>{activeRoom.label}</h3>
                          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                            {activeRoom.products.length} products · click to mark as interested · {interestedProducts.filter((n) => activeRoom.products.find((prod) => prod.name === n)).length} selected
                          </p>
                        </div>
                        {/* Category-grouped view for curtains; flat grid for all other rooms */}
                        {activeRoom.id === "curtains" ? (() => {
                          const cats = Array.from(new Set(activeRoom.products.map((pr) => pr.cat)));
                          return (
                            <div>
                              {cats.map((cat) => {
                                const catProducts = activeRoom.products.filter((pr) => pr.cat === cat);
                                return (
                                  <div key={cat}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#FAF6EE", borderBottom: `1px solid ${BORDER}`, borderTop: `1px solid ${BORDER}` }}>
                                      <div style={{ width: 6, height: 6, background: GOLD, borderRadius: "50%", flexShrink: 0 }} />
                                      <span style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>{cat}</span>
                                      <div style={{ flex: 1, height: 1, background: BORDER }} />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                                      {catProducts.map((product, ci) => {
                                        const ts = tagStyle(product.tag);
                                        const interested = interestedProducts.includes(product.name);
                                        return (
                                          <button key={product.name} type="button" onClick={() => toggleInterested(product.name)}
                                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 14px", border: `1px solid rgba(201,168,76,${interested ? 0.55 : 0.2})`, margin: "-1px 0 0 -1px", background: interested ? "rgba(201,168,76,0.07)" : "#FFF", cursor: "pointer", textAlign: "left" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                              <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: interested ? GOLD : "rgba(201,168,76,0.08)", border: `1px solid ${interested ? GOLD : BORDER_S}`, color: interested ? DARK : GOLD, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                                                {interested ? "★" : ci + 1}
                                              </span>
                                              <div>
                                                <div style={{ fontSize: 11, color: interested ? DARK : CHARCOAL, fontWeight: interested ? 500 : 400, lineHeight: 1.4 }}>{product.name}</div>
                                              </div>
                                            </div>
                                            {ts && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 8px", background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{product.tag}</span>}
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                          {activeRoom.products.map((product, i) => {
                            const ts = tagStyle(product.tag);
                            const interested = interestedProducts.includes(product.name);
                            return (
                              <button key={product.name} type="button" onClick={() => toggleInterested(product.name)}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 14px", border: `1px solid rgba(201,168,76,${interested ? 0.55 : 0.2})`, margin: "-1px 0 0 -1px", background: interested ? "rgba(201,168,76,0.07)" : "#FFF", cursor: "pointer", textAlign: "left" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: interested ? GOLD : "rgba(201,168,76,0.08)", border: `1px solid ${interested ? GOLD : BORDER_S}`, color: interested ? DARK : GOLD, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                                    {interested ? "★" : i + 1}
                                  </span>
                                  <div>
                                    <div style={{ fontSize: 11, color: interested ? DARK : CHARCOAL, fontWeight: interested ? 500 : 400, lineHeight: 1.4 }}>{product.name}</div>
                                    <div style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(107,95,82,0.5)", marginTop: 1 }}>{product.cat}</div>
                                  </div>
                                </div>
                                {ts && <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 8px", background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{product.tag}</span>}
                              </button>
                            );
                          })}
                        </div>
                        )}
                        <div style={{ padding: "12px 16px", background: "#FAF6EE", border: `1px solid ${BORDER}`, borderTop: "none", borderLeft: "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                            <div style={{ flex: 1, height: 1, background: BORDER }} />
                            <span style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD }}>Associate Note</span>
                            <div style={{ flex: 1, height: 1, background: BORDER }} />
                          </div>
                          <p style={{ fontSize: 11, color: WARM, lineHeight: 1.8, fontWeight: 300 }}>
                            {styleId && STYLE_NOTE[styleId] ? STYLE_NOTE[styleId] : "Ask about room dimensions, preferred colour palette, and delivery timeline."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Style Brief slide */}
                {((formOpen && rightTab === "brief") || (!formOpen && tvSlide === 0)) && (
                  <BriefSlide
                    customerName={customerName} threeWords={threeWords}
                    briefLineItems={briefLines()} palette={palette} styleId={styleId}
                    interestedProducts={interestedProducts} selectedRooms={selectedRooms}
                    visitPurpose={visitPurpose} budget={budget} timeline={timeline}
                    formOpen={formOpen} tvPaused={tvPaused} tvSlide={tvSlide}
                  />
                )}

                {/* Associate Notes tab */}
                {formOpen && rightTab === "notes" && (
                  <NotesPanel
                    associateNotes={associateNotes} setAssociateNotes={setAssociateNotes}
                    leadStatus={leadStatus} setLeadStatus={setLeadStatus}
                    followUpDate={followUpDate} setFollowUpDate={setFollowUpDate}
                    sessionTags={sessionTags} setSessionTags={setSessionTags}
                    interestedProducts={interestedProducts} styleId={styleId}
                  />
                )}

                {/* TV Room slide */}
                {!formOpen && tvSlide > 0 && (() => {
                  const tvRoom = matchedRooms[tvSlide - 1];
                  if (!tvRoom) return null;
                  return (
                    <RoomSlide
                      tvRoom={tvRoom} tvSlide={tvSlide} matchedRooms={matchedRooms}
                      interestedProducts={interestedProducts} palette={palette} styleId={styleId}
                      tvPaused={tvPaused} toggleInterested={toggleInterested}
                    />
                  );
                })()}

                {/* TV Controls */}
                {!formOpen && (
                  <div style={{ background: "#120E06", borderTop: `1px solid ${BORDER}` }}>
                    {!tvPaused && (
                      <div style={{ height: 2, background: "rgba(201,168,76,0.1)", position: "relative", overflow: "hidden" }}>
                        <div key={`prog-${tvSlide}`} style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})`, transformOrigin: "left", animation: `tvProgress ${TV_INTERVAL}ms linear` }} />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "10px 52px 10px", borderBottom: "1px solid rgba(201,168,76,0.08)", scrollbarWidth: "none" }}>
                      <button type="button" onClick={() => { setTvSlide(0); setTvPaused(true); }}
                        style={{ flexShrink: 0, padding: "5px 16px", border: `1px solid ${tvSlide === 0 ? BORDER_S : "rgba(201,168,76,0.15)"}`, background: tvSlide === 0 ? "rgba(201,168,76,0.12)" : "transparent", color: tvSlide === 0 ? GOLD_L : "rgba(255,255,255,0.28)", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", marginRight: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: tvSlide === 0 ? GOLD : "rgba(201,168,76,0.3)", fontSize: 9 }}>◆</span> Style Brief
                      </button>
                      {matchedRooms.map((room, i) => {
                        const active = tvSlide === i + 1;
                        return (
                          <button key={room.id} type="button" onClick={() => { setTvSlide(i + 1); setTvPaused(true); }}
                            style={{ flexShrink: 0, padding: "5px 16px", border: `1px solid ${active ? BORDER_S : "rgba(201,168,76,0.15)"}`, background: active ? "rgba(201,168,76,0.12)" : "transparent", color: active ? GOLD_L : "rgba(255,255,255,0.28)", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", marginRight: 6 }}>
                            {i + 1}. {room.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 52px" }}>
                      <div style={{ fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(201,168,76,0.4)", minWidth: 200 }}>
                        {tvSlide === 0 ? "◆ Style Brief" : `◆ Room ${tvSlide} of ${matchedRooms.length} — ${matchedRooms[tvSlide - 1]?.label || ""}`}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button type="button" onClick={() => { setTvSlide((p) => (p - 1 + tvTotalSlides) % tvTotalSlides); setTvPaused(true); }}
                          style={{ background: "transparent", border: "1px solid rgba(201,168,76,0.28)", color: GOLD_L, cursor: "pointer", padding: "5px 16px", fontSize: 13, letterSpacing: 1 }}>◀</button>
                        <div style={{ fontSize: 9, color: "rgba(201,168,76,0.5)", letterSpacing: "0.1em", minWidth: 50, textAlign: "center" }}>{tvSlide + 1} / {tvTotalSlides}</div>
                        <button type="button" onClick={() => { setTvSlide((p) => (p + 1) % tvTotalSlides); setTvPaused(true); }}
                          style={{ background: "transparent", border: "1px solid rgba(201,168,76,0.28)", color: GOLD_L, cursor: "pointer", padding: "5px 16px", fontSize: 13, letterSpacing: 1 }}>▶</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 200, justifyContent: "flex-end" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: tvPaused ? "rgba(255,255,255,0.2)" : GOLD }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: tvPaused ? "rgba(255,255,255,0.15)" : GOLD, display: "inline-block", boxShadow: tvPaused ? "none" : `0 0 8px ${GOLD}` }} />
                          {tvPaused ? "Paused" : "7s auto"}
                        </div>
                        <button type="button" onClick={() => setTvPaused((v) => !v)}
                          style={{ background: tvPaused ? "rgba(201,168,76,0.1)" : "transparent", border: `1px solid ${tvPaused ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.1)"}`, color: tvPaused ? GOLD : "rgba(255,255,255,0.28)", cursor: "pointer", padding: "5px 16px", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                          {tvPaused ? "▶ Resume" : "⏸ Pause"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
