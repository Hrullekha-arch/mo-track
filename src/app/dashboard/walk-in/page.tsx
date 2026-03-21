"use client";

import { useEffect, useState } from "react";
import {
  collection, deleteDoc, doc, getDocs,
  onSnapshot, query, updateDoc, where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Walkin_Customer, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { attendToWalkin, handoverToSalesman } from "./actions";
import { getSalesmen } from "../customers/actions";

// ─── shadcn/ui ────────────────────────────────────────────────────────────────
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── icons ────────────────────────────────────────────────────────────────────
import {
  Loader2, Users, UserCheck, Trash2, Eye,
  BadgeCheck, Search, CheckCircle2, Circle,
  ChevronDown, CalendarDays, MessageSquarePlus,
  ClipboardList, ArrowRightLeft, Package,
  GitBranch, AlertCircle,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────
type WorkflowStep   = { label: string; status: string };
type OrderSections  = Record<string, any>;
type WentBackQaItem = { question: string; answer: string; wentBackdate?: string };

// ─── constants ────────────────────────────────────────────────────────────────
const WENT_BACK_QUESTIONS = [
  "He could not find exactly what he was looking for?",
  "The price was higher than his budget?",
  "He need to compare option with other showrooms?",
  "The Item he wanted was out of stock?",
  "The delivery or lead time was too long",
  "The product quality didn't meet His expectations",
  "He had questions that were not answered",
  "Will come back again with designer",
  "Will come back again with family/Friend",
  "He wasn't able to find assistance",
];
const FOLLOW_UP_QUESTIONS = [
  "Will come back again with family/Friend",
  "Will come back again with designer",
];
const NO_ANSWER_QUESTIONS = ["He need to compare option with other showrooms?"];

// ─────────────────────────────────────────────────────────────────────────────
export default function WalkinDataPage() {
  const [walkinData,       setWalkinData]       = useState<Walkin_Customer[]>([]);
  const [salesmen,         setSalesmen]         = useState<User[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [updatingId,       setUpdatingId]       = useState<string | null>(null);
  const [selectedOrderId,  setSelectedOrderId]  = useState<string | null>(null);
  const [sections,         setSections]         = useState<OrderSections>({});
  const [workflow,         setWorkflow]         = useState<WorkflowStep[]>([]);
  const [search,           setSearch]           = useState("");
  const [wentBackCustomer, setWentBackCustomer] = useState<Walkin_Customer | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [answer,           setAnswer]           = useState("");
  const [followUpDate,     setFollowUpDate]     = useState("");
  const [qaList,           setQaList]           = useState<WentBackQaItem[]>([]);

  const { toast } = useToast();
  const { user }  = useAuth();

  const isAdmin        = user?.role        === "admin";
  const isCrm          = user?.designation === "CRM";
  const isSalesmanager = user?.designation === "salesmanager";
  const canManage      = isCrm || isAdmin;
  const canAcknowledge = isAdmin || isSalesmanager;

  // ── Firestore listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) { setWalkinData([]); setLoading(false); return; }
    setLoading(true);

    const q = isAdmin || isSalesmanager
      ? query(collection(db, "Walkin_Customer"))
      : query(collection(db, "Walkin_Customer"), where("createdById", "==", user.id));

    const unsub = onSnapshot(q,
      (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Walkin_Customer))
          .sort((a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
        setWalkinData(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch walk-in data." });
        setLoading(false);
      }
    );

    getSalesmen().then(setSalesmen);
    return () => unsub();
  }, [user?.id, user?.role]);

  // ── Order details ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedOrderId) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "orders"), where("orderId", "==", selectedOrderId))
      );
      if (snap.empty) return;
      const data = snap.docs[0].data();
      setSections(data.sections || {});
      setWorkflow(Object.values(data.workflow?.milestones || {}));
    })();
  }, [selectedOrderId]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleAttend = async (customerId: string) => {
    if (!user) return;
    setUpdatingId(customerId);
    try {
      const res = await attendToWalkin(customerId, { id: user.id, name: user.name });
      toast(res.success
        ? { title: "Now attending customer" }
        : { variant: "destructive", title: "Error", description: res.message });
    } finally { setUpdatingId(null); }
  };

  const handleHandover = async (customerId: string, salesman: User) => {
    if (!user) return;
    setUpdatingId(customerId);
    try {
      const res = await handoverToSalesman(
        customerId,
        { id: salesman.id, name: salesman.name },
        { id: user.id,     name: user.name }
      );
      toast(res.success
        ? { title: `Handed over to ${salesman.name}` }
        : { variant: "destructive", title: "Error", description: res.message });
    } finally { setUpdatingId(null); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "Walkin_Customer", id));
      toast({ title: "Customer deleted" });
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await updateDoc(doc(db, "Walkin_Customer", id), {
        acknowledgedStatus: {
          status:         true,
          acknowledgedBy: user?.name,
          updatedAt:      new Date().toISOString(),
        },
      });
      toast({ title: "Acknowledged" });
    } catch (e) { console.error(e); }
  };

  // ── Went-back dialog ─────────────────────────────────────────────────────────
  const resetWentBack = () => {
    setWentBackCustomer(null);
    setSelectedQuestion("");
    setAnswer("");
    setFollowUpDate("");
    setQaList([]);
  };

  const handleAddResponse = () => {
    const isFollowUp = FOLLOW_UP_QUESTIONS.includes(selectedQuestion);
    const isNoAnswer = NO_ANSWER_QUESTIONS.includes(selectedQuestion);

    if (!selectedQuestion) {
      toast({ variant: "destructive", title: "Select a question first" });
      return;
    }
    if (!isNoAnswer && !answer) {
      toast({ variant: "destructive", title: "Enter an answer" });
      return;
    }
    if (isFollowUp && !followUpDate) {
      toast({ variant: "destructive", title: "Select a revisit date" });
      return;
    }

    setQaList(prev => [...prev, {
      question:     selectedQuestion,
      answer:       isNoAnswer ? "N/A" : answer,
      wentBackdate: isFollowUp ? followUpDate : "Not Required",
    }]);
    setSelectedQuestion("");
    setAnswer("");
    setFollowUpDate("");
  };

  const handleSubmitWentBack = async () => {
    if (!wentBackCustomer) return;
    if (!qaList.length) {
      toast({ variant: "destructive", title: "Add at least one response" });
      return;
    }
    try {
      await updateDoc(doc(db, "Walkin_Customer", wentBackCustomer.id), {
        wentBackResponses: qaList,
        acknowledgedStatus: {
          status:         true,
          acknowledgedBy: user?.name || "Unknown",
          updatedAt:      new Date().toISOString(),
        },
        lastUpdatedAt: new Date().toISOString(),
      });
      toast({ title: "Went-back responses saved" });
      resetWentBack();
    } catch {
      toast({ variant: "destructive", title: "Save failed" });
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const getFiltered = (tab: "all" | "went-back") =>
    walkinData
      .filter(c => tab === "went-back" ? c.status === "went-back" : true)
      .filter(c => {
        const q = search.toLowerCase();
        return !q || `${c.firstName} ${c.familyName} ${c.mobile}`.toLowerCase().includes(q);
      });

  const stats = {
    total:    walkinData.length,
    pending:  walkinData.filter(c => c.status === "Pending").length,
    attended: walkinData.filter(c => c.status === "Attended").length,
    handed:   walkinData.filter(c => c.status === "Handed Over").length,
    deal:     walkinData.filter(c => c.status === "Deal Created").length,
    wentBack: walkinData.filter(c => c.status === "went-back").length,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Inline sub-components
  // ─────────────────────────────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status?: string }) => {
    const variants: Record<string, { bg: string; text: string; dot: string; label: string }> = {
      "Pending":      { bg: "bg-stone-100",   text: "text-stone-500",   dot: "bg-stone-400",   label: "Pending" },
      "Attended":     { bg: "bg-sky-50",      text: "text-sky-700",     dot: "bg-sky-500",     label: "Attended" },
      "Handed Over":  { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500",   label: "Handed Over" },
      "Deal Created": { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500", label: "Deal Created" },
      "went-back":    { bg: "bg-rose-50",     text: "text-rose-600",    dot: "bg-rose-500",    label: "Went Back" },
    };
    const v = variants[status ?? ""] ?? variants["Pending"];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide ${v.bg} ${v.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
        {v.label}
      </span>
    );
  };

  const fmtLooking = (v?: string | string[]) =>
    Array.isArray(v) ? v.filter(Boolean).join(", ") || "—" : v || "—";

  // ── Action cell ───────────────────────────────────────────────────────────────
  const ActionCell = ({ customer: c }: { customer: Walkin_Customer }) => {
    const busy  = updatingId === c.id;
    const isAck = c.acknowledgedStatus?.status === true || c.acknowledgedStatus?.status === "true";

    return (
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Attend */}
        {canManage && c.status === "Pending" && (
          <Button size="sm" variant="outline"
            className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-all"
            onClick={() => handleAttend(c.id)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            Attend
          </Button>
        )}

        {/* Handover */}
        {canManage && c.status === "Attended" && c.attendedBy?.id === user?.id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"
                className="h-7 gap-1 text-xs border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
                disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
                Handover
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {salesmen.map(s => (
                <DropdownMenuItem key={s.id} onSelect={() => handleHandover(c.id, s)}>
                  <Users className="h-3 w-3 mr-2 text-stone-400" />
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Acknowledge */}
        {canAcknowledge && (
          isAck ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
              <BadgeCheck className="h-3.5 w-3.5" /> Acknowledged
            </span>
          ) : c.status === "went-back" ? (
            <Button size="sm" variant="outline"
              className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all"
              onClick={() => setWentBackCustomer(c)}>
              <MessageSquarePlus className="h-3 w-3" />
              Acknowledge
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline"
                  className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
                  <BadgeCheck className="h-3 w-3" />
                  Acknowledge
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Acknowledgement</AlertDialogTitle>
                  <AlertDialogDescription>Mark this customer as acknowledged?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAcknowledge(c.id)}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        )}

        {/* View Sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" variant="ghost"
              className="h-7 gap-1 text-xs text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all"
              onClick={() => c.cashsale?.OrderId && setSelectedOrderId(c.cashsale.OrderId)}>
              <Eye className="h-3 w-3" /> View
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[420px] sm:w-[460px] overflow-y-auto p-0">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-6 py-5">
              <SheetHeader>
                <SheetTitle className="text-base font-semibold text-stone-900 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-[11px] font-bold text-stone-600 flex-shrink-0">
                    {c.firstName?.[0]}{c.familyName?.[0]}
                  </div>
                  <div>
                    <div>{c.firstName} {c.familyName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[10px] text-stone-400 font-mono font-normal">{c.walkinId || c.id?.slice(0, 8)}</code>
                      <StatusBadge status={c.status} />
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Contact */}
              <SheetSection icon={<ClipboardList className="h-3.5 w-3.5" />} title="Contact Info">
                <SheetRow label="Mobile"      value={<span className="font-mono text-[12px] text-stone-700">{c.mobile}</span>} />
                <SheetRow label="Looking for" value={fmtLooking(c.lookingFor)} />
                <SheetRow label="Created"     value={c.createdAt ? format(new Date(c.createdAt), "PPP") : "N/A"} />
              </SheetSection>

              {/* Handling */}
              <SheetSection icon={<Users className="h-3.5 w-3.5" />} title="Handling">
                <SheetRow label="Attended by"  value={c.attendedBy?.name || "—"} />
                <SheetRow label="Handed to"    value={c.salesmanName || "—"} />
                <SheetRow label="Acknowledged" value={
                  c.acknowledgedStatus?.status
                    ? <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Yes</span>
                    : <span className="text-stone-400 text-xs">No</span>
                } />
              </SheetSection>

              {/* Went-back reasons */}
              {c.wentBackResponses?.length > 0 && (
                <SheetSection icon={<AlertCircle className="h-3.5 w-3.5" />} title="Went Back Reasons">
                  {c.wentBackResponses.map((wb: WentBackQaItem, i: number) => (
                    <div key={i} className="px-3.5 py-3 bg-white border-b border-stone-50 last:border-0">
                      <p className="text-[11px] font-semibold text-rose-600">{wb.question}</p>
                      <p className="text-[11px] text-stone-500 mt-1">Answer: {wb.answer}</p>
                      {wb.wentBackdate && wb.wentBackdate !== "Not Required" && (
                        <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {wb.wentBackdate}
                        </p>
                      )}
                    </div>
                  ))}
                </SheetSection>
              )}

              {/* Deal snapshot */}
              {c.dealSnapshot && (
                <SheetSection icon={<Package className="h-3.5 w-3.5" />} title="Deal Details">
                  <SheetRow label="Deal ID"              value={<span className="font-mono text-[12px]">{c.dealSnapshot.dealId || "—"}</span>} />
                  <SheetRow label="Deal Name"            value={c.dealSnapshot.dealName || "—"} />
                  <SheetRow label="Advance Received"     value={c.dealSnapshot.advanceReceived || "—"} />
                  <SheetRow label="Measurement Required" value={c.dealSnapshot.measurementRequired || "—"} />
                  <SheetRow label="Lead Status"          value={c.dealSnapshot.status || "—"} />
                </SheetSection>
              )}

              {/* Cash sale order */}
              {c.cashsale && (
                <SheetSection icon={<Package className="h-3.5 w-3.5" />} title="Order">
                  <SheetRow label="Order ID"  value={<span className="font-mono text-[12px]">{c.cashsale.OrderId}</span>} />
                  <SheetRow label="Deal type" value={c.cashsale.dealType} />
                  <SheetRow label="Sale type" value={c.cashsale.type} />
                  <SheetRow label="Status"    value={c.cashsale.status} />
                </SheetSection>
              )}

              {/* Fabric */}
              {sections?.NORMAL?.items?.length > 0 && (
                <SheetSection icon={<ClipboardList className="h-3.5 w-3.5" />} title="Fabric Details">
                  {sections.NORMAL.items.map((item: any, i: number) => (
                    <div key={i} className="px-3.5 py-3 bg-white border-b border-stone-50 last:border-0">
                      <div className="flex justify-between text-xs font-semibold text-stone-700 mb-1">
                        <span>{item.type}</span>
                        <span className="font-mono text-stone-500 text-[11px]">{item.bcn || "—"}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-400">
                        <span>Qty: {item.qty} {item.unit || "Mtr"}</span>
                        <span>₹{item.totalAmount || "—"}</span>
                      </div>
                    </div>
                  ))}
                </SheetSection>
              )}

              {/* Workflow */}
              {workflow.length > 0 && (
                <SheetSection icon={<GitBranch className="h-3.5 w-3.5" />} title="Order Workflow">
                  {workflow.map((step, i) => {
                    const done   = step.status === "DONE";
                    const active = step.status === "IN PROGRESS";
                    return (
                      <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 border-b border-stone-50 last:border-0 ${
                        done ? "bg-emerald-50/60" : active ? "bg-sky-50/60" : "bg-white"
                      }`}>
                        {done
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          : <Circle className={`h-4 w-4 flex-shrink-0 ${active ? "text-sky-500" : "text-stone-300"}`} />
                        }
                        <span className={`text-xs flex-1 font-medium ${done ? "text-emerald-800" : active ? "text-sky-700" : "text-stone-400"}`}>
                          {step.label}
                        </span>
                        <span className={`text-[10px] font-mono font-bold ${
                          done ? "text-emerald-600" : active ? "text-sky-600" : "text-stone-400"
                        }`}>{step.status}</span>
                      </div>
                    );
                  })}
                </SheetSection>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete */}
        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost"
                className="h-7 w-7 p-0 text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-all">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                <AlertDialogDescription>This is permanent and cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => handleDelete(c.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  };

  // ── Customer table ────────────────────────────────────────────────────────────
  const CustomerTable = ({ rows }: { rows: Walkin_Customer[] }) => (
    <div className="rounded-xl border border-stone-100 overflow-hidden shadow-sm bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50 hover:bg-stone-50 border-b border-stone-100">
            {["Date","Customer","Mobile","Looking For","Status","Attended By","Handed To","Actions"].map(h => (
              <TableHead key={h} className="text-[10px] font-semibold font-mono text-stone-400 uppercase tracking-widest py-3 font-normal">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            : rows.length > 0
              ? rows.map((c, idx) => (
                  <TableRow key={c.id}
                    className={`border-b border-stone-50 last:border-0 hover:bg-stone-50/80 transition-colors ${
                      idx % 2 === 1 ? "bg-stone-50/30" : "bg-white"
                    }`}>
                    <TableCell className="text-[11px] font-mono text-stone-400 whitespace-nowrap">
                      {c.createdAt ? format(new Date(c.createdAt), "dd MMM") : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500 flex-shrink-0 select-none">
                          {c.firstName?.[0]}{c.familyName?.[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-stone-800 text-[13px] leading-tight">{c.firstName} {c.familyName}</div>
                          <div className="text-[10px] font-mono text-stone-400">{c.walkinId || c.id?.slice(0, 8)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-stone-600">{c.mobile}</TableCell>
                    <TableCell className="text-[12px] text-stone-500 max-w-[140px] truncate">{fmtLooking(c.lookingFor)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-[12px] text-stone-500">{c.attendedBy?.name || "—"}</TableCell>
                    <TableCell className="text-[12px] text-stone-500">{c.salesmanName || "—"}</TableCell>
                    <TableCell><ActionCell customer={c} /></TableCell>
                  </TableRow>
                ))
              : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Users className="h-8 w-8 text-stone-200" />
                      <span className="text-sm">No walk-in customers found</span>
                    </div>
                  </TableCell>
                </TableRow>
              )
          }
        </TableBody>
      </Table>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f6]">

      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Walk-in Desk</h1>
            <p className="text-[11px] font-mono text-stone-400 mt-0.5 uppercase tracking-wider">CRM · Floor Operations</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-600 tracking-widest">LIVE</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-stone-100">
        <div className="grid grid-cols-6 divide-x divide-stone-100">
          {[
            { label: "Total",        value: stats.total,    color: "text-stone-900" },
            { label: "Pending",      value: stats.pending,  color: "text-stone-400" },
            { label: "Attended",     value: stats.attended, color: "text-sky-600"   },
            { label: "Handed Over",  value: stats.handed,   color: "text-amber-600" },
            { label: "Deal Created", value: stats.deal,     color: "text-emerald-600" },
            { label: "Went Back",    value: stats.wentBack, color: "text-rose-500"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-0.5 px-5 py-4 hover:bg-stone-50 transition-colors cursor-default">
              <span className={`text-2xl font-bold tracking-tight ${color}`}>{value}</span>
              <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <Tabs defaultValue="all">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <TabsList className="bg-stone-100 h-9 p-1 rounded-lg">
              <TabsTrigger value="all"
                className="text-xs rounded-md data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm transition-all">
                All Leads
                <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-500 text-[10px] font-mono">
                  {walkinData.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="wentback"
                className="text-xs rounded-md data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm transition-all">
                Went Back
                <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-500 text-[10px] font-mono">
                  {stats.wentBack}
                </span>
              </TabsTrigger>
            </TabsList>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
              <Input
                className="pl-9 h-9 text-xs w-60 bg-white border-stone-200 rounded-lg shadow-sm placeholder:text-stone-400 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-400"
                placeholder="Search name or mobile…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <TabsContent value="all">
            <CustomerTable rows={getFiltered("all")} />
          </TabsContent>
          <TabsContent value="wentback">
            <CustomerTable rows={getFiltered("went-back")} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Went-back acknowledge dialog */}
      <Dialog open={!!wentBackCustomer} onOpenChange={open => !open && resetWentBack()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-4 w-4 text-rose-500" />
              Went Back Details
              {wentBackCustomer && (
                <span className="text-stone-400 font-normal text-sm">
                  · {wentBackCustomer.firstName} {wentBackCustomer.familyName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Question */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Reason for Went Back
              </label>
              <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
                <SelectTrigger className="text-sm border-stone-200 focus:ring-emerald-500/20">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {WENT_BACK_QUESTIONS.map((q, i) => (
                    <SelectItem key={i} value={q} className="text-sm">{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Answer input (conditional) */}
            {selectedQuestion && !NO_ANSWER_QUESTIONS.includes(selectedQuestion) && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  {FOLLOW_UP_QUESTIONS.includes(selectedQuestion) ? "Additional Notes" : "Answer"}
                </label>
                <Input
                  placeholder="Enter details…"
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  className="text-sm border-stone-200 focus-visible:ring-emerald-500/20"
                />
              </div>
            )}

            {/* Revisit date (follow-up only) */}
            {FOLLOW_UP_QUESTIONS.includes(selectedQuestion) && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" /> Expected Revisit Date
                </label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="text-sm w-44 border-stone-200 focus-visible:ring-emerald-500/20"
                />
              </div>
            )}

            <Button onClick={handleAddResponse} variant="outline"
              className="w-full h-9 text-sm border-dashed border-stone-300 text-stone-500 hover:bg-stone-50">
              <MessageSquarePlus className="h-3.5 w-3.5 mr-2" />
              Add Response
            </Button>

            {/* Added responses preview */}
            {qaList.length > 0 && (
              <div className="rounded-xl border border-stone-100 overflow-hidden max-h-44 overflow-y-auto">
                <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
                  <span className="text-[10px] font-mono font-semibold text-stone-400 uppercase tracking-wider">
                    {qaList.length} response{qaList.length > 1 ? "s" : ""} added
                  </span>
                </div>
                {qaList.map((item, i) => (
                  <div key={i} className="px-3.5 py-3 border-b border-stone-50 last:border-0 bg-white">
                    <p className="text-[11px] font-semibold text-stone-700">{item.question}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{item.answer}</p>
                    {item.wentBackdate && item.wentBackdate !== "Not Required" && (
                      <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {item.wentBackdate}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-9 text-sm border-stone-200" onClick={resetWentBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-9 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleSubmitWentBack()}
                disabled={!qaList.length}>
                <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
                Submit & Acknowledge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sheet helper components ──────────────────────────────────────────────────
function SheetSection({
  title, icon, children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-stone-400">{icon}</span>
        <p className="text-[10px] font-mono font-semibold text-stone-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="rounded-xl border border-stone-100 overflow-hidden divide-y divide-stone-50">
        {children}
      </div>
    </div>
  );
}

function SheetRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center px-3.5 py-2.5 bg-white hover:bg-stone-50/60 transition-colors">
      <span className="text-[11px] text-stone-400 font-medium">{label}</span>
      <span className="text-[12px] text-stone-800 font-semibold text-right max-w-[220px]">{value}</span>
    </div>
  );
}