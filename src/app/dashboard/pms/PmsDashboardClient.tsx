"use client";

<<<<<<< HEAD
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  query,
  orderBy,
  limit,
  where,
  deleteField,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Check,
  Settings2,
  Users,
  Clock,
  Package,
  AlertCircle,
  TrendingUp,
  Eye,
  ListChecks,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Order } from "@/lib/types";
import {
  AUTO_ADVANCE_POLL_MS,
  IST_TIMEZONE_OFFSET_MINUTES,
  buildEmbellishmentForm,
  emptyEmbellishmentForm,
  formatDateTime,
  isEmbellishmentProcess,
  toNumber,
  CreateJobDialogRow,
  CreateJobDialogState,
  EmbellishmentFormValues,
  PmsCategory,
  PmsDowntime,
  PmsEmbellishmentRecord,
  PmsJob,
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsSkill,
  StoredEmbellishment,
} from "./pmsCore";
import { usePmsDerivedData } from "./hooks/usePmsDerivedData";
import { usePmsConfigActions } from "./hooks/usePmsConfigActions";
import { usePmsSkillPanel } from "./hooks/usePmsSkillPanel";
import { PmsOperationsTabs } from "./components/PmsOperationsTabs";
import { PmsSetupTabs } from "./components/PmsSetupTabs";
import { PmsDialogs } from "./components/PmsDialogs";

export default function PmsPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<PmsProduct[]>([]);
  const [pmsCategories, setPmsCategories] = useState<PmsCategory[]>([]);
  const [routing, setRouting] = useState<PmsRouting[]>([]);
  const [machines, setMachines] = useState<PmsMachine[]>([]);
  const [people, setPeople] = useState<PmsPerson[]>([]);
  const [skills, setSkills] = useState<PmsSkill[]>([]);
  const [downtimes, setDowntimes] = useState<PmsDowntime[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<PmsJob[]>([]);
  const [plans, setPlans] = useState<PmsPlan[]>([]);
  const [embellishmentRecords, setEmbellishmentRecords] = useState<PmsEmbellishmentRecord[]>([]);
  const [activeTab, setActiveTab] = useState("live");
  const [vasSearch, setVasSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [workDetailSearch, setWorkDetailSearch] = useState("");
  const [embellishmentSearch, setEmbellishmentSearch] = useState("");
  const [creatingJobKey, setCreatingJobKey] = useState<string | null>(null);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [runningPriorityReplan, setRunningPriorityReplan] = useState(false);
  const [resettingAutopilot, setResettingAutopilot] = useState(false);
  const [resetAutopilotDialogOpen, setResetAutopilotDialogOpen] = useState(false);
  const [expandedWorkRows, setExpandedWorkRows] = useState<Record<string, boolean>>({});
  const [priorityUpdatingOrderId, setPriorityUpdatingOrderId] = useState<string | null>(null);
  const [deletingPlanKey, setDeletingPlanKey] = useState<string | null>(null);
  const [manualDoneDialog, setManualDoneDialog] = useState<{
    open: boolean;
    row: null | {
      key: string;
      jobId: string;
      orderId: string;
      orderNo: string;
      customer: string;
      vasName: string;
      process: string;
      qty: number;
      stepNo?: number;
      totalSteps: number;
      plannedStart?: string;
      plannedEnd?: string;
    };
  }>({ open: false, row: null });
  const [manualDoneAllQtyReady, setManualDoneAllQtyReady] = useState<"yes" | "no">("yes");
  const [manualDoneRemainingQty, setManualDoneRemainingQty] = useState("");
  const [manualDoneReason, setManualDoneReason] = useState("");
  const [manualDoneSaving, setManualDoneSaving] = useState(false);
  const [createJobDialog, setCreateJobDialog] = useState<CreateJobDialogState>({
    open: false,
    row: null,
    embellishmentEnabled: false,
    form: emptyEmbellishmentForm,
  });
  const [workingHours, setWorkingHours] = useState({
    startTime: "10:00",
    endTime: "20:00",
    timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
  });
  const [savingWorkingHours, setSavingWorkingHours] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [routingRows, setRoutingRows] = useState<PmsRouting[]>([]);
  const [savingRouting, setSavingRouting] = useState(false);

  // Search states
  const [productSearch, setProductSearch] = useState("");
  const [machineSearch, setMachineSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");

  // Edit states
  const [editingMachine, setEditingMachine] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: "product" | "machine" | "person" | "routing" | "downtime";
    id: string;
    name: string;
  }>({ open: false, type: "product", id: "", name: "" });

  const [newProduct, setNewProduct] = useState({ name: "", category: "" });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newMachine, setNewMachine] = useState({ name: "", process: "", shiftMinutes: "480" });
  const [newPerson, setNewPerson] = useState({ name: "", role: "" });
  const [newDowntime, setNewDowntime] = useState({ machineId: "", from: "", to: "", reason: "" });
 

  const [importState, setImportState] = useState<{
    open: boolean;
    tab: "routing" | "machines" | "skills" | "downtime";
    text: string;
    loading: boolean;
    preview: any[];
  }>({ open: false, tab: "routing", text: "", loading: false, preview: [] });

  const [showInactiveMachines, setShowInactiveMachines] = useState(true);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubPmsCategories = onSnapshot(collection(db, "pmsCategories"), (snap) => {
      setPmsCategories(
        snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
      );
    });
    const unsubRouting = onSnapshot(collection(db, "routing"), (snap) => {
      setRouting(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubMachines = onSnapshot(collection(db, "machines"), (snap) => {
      setMachines(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubPeople = onSnapshot(collection(db, "people"), (snap) => {
      setPeople(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubSkills = onSnapshot(collection(db, "machineSkills"), (snap) => {
      setSkills(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubDowntime = onSnapshot(collection(db, "machineDowntime"), (snap) => {
      setDowntimes(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(250));
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) } as Order)));
    });
    const activeJobStatuses = ["WAITING", "PLANNED", "IN_PROGRESS", "DONE"];
    const jobsQuery = query(collection(db, "jobs"), where("status", "in", activeJobStatuses));
    const unsubJobs = onSnapshot(jobsQuery, (snap) => {
      setJobs(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubPlans = onSnapshot(collection(db, "plan"), (snap) => {
      setPlans(snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
    });
    const unsubEmbellishment = onSnapshot(collection(db, "pmsEmbellishment"), (snap) => {
      setEmbellishmentRecords(
        snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
      );
    });



    return () => {
      unsubProducts();
      unsubPmsCategories();
      unsubRouting();
      unsubMachines();
      unsubPeople();
      unsubSkills();
      unsubDowntime();
      unsubOrders();
      unsubJobs();
      unsubPlans();
      unsubEmbellishment();
    };
  }, []);

  useEffect(() => {
    const ref = doc(db, "pmsSettings", "workingHours");
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      setWorkingHours((prev) => ({
        ...prev,
        startTime: typeof data?.startTime === "string" ? data.startTime : prev.startTime,
        endTime: typeof data?.endTime === "string" ? data.endTime : prev.endTime,
        timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
      }));
    });
  }, []);

  useEffect(() => {
    if (!selectedProductId) {
      setRoutingRows([]);
      return;
    }
    const rows = routing
      .filter((row) => row.productId === selectedProductId)
      .sort((a, b) => a.stepNo - b.stepNo);
    setRoutingRows((prev) => {
      if (rows.length) return rows;
      const localRows = prev
        .filter(
          (row) =>
            row.productId === selectedProductId && String(row.id || "").startsWith("local-")
        )
        .sort((a, b) => a.stepNo - b.stepNo);
      return localRows;
    });
  }, [routing, selectedProductId]);

  const {
    categories,
    filteredProducts,
    filteredMachines,
    filteredPeople,
    stats,
    createJobTotals,
    isOrderInvoiced,
    isOrderClosedForPms,
    liveVasRowsAll,
    liveVasRows,
    routingNotEnteredItems,
    liveStats,
    resolveVasInfo,
    workDetailRows,
    workSheetStepRows,
    workStatusRows,
    workStatusSummary,
    filteredWorkStatusRows,
    filteredWorkDetailRows,
    filteredEmbellishmentRows,
  } = usePmsDerivedData({
    products,
    pmsCategories,
    routing,
    machines,
    people,
    skills,
    downtimes,
    orders,
    jobs,
    plans,
    embellishmentRecords,
    createJobDialog,
    productSearch,
    machineSearch,
    personSearch,
    showInactiveMachines,
    vasSearch,
    statusSearch,
    workDetailSearch,
    embellishmentSearch,
  });

  const syncingWorkSheetRef = useRef(false);
  const lastWorkSheetPayloadRef = useRef("");
  const autoAdvanceRef = useRef(false);
  const buildWorkSheetRows = (
    rows: Array<{
      orderNo: string;
      customer: string;
      vasName: string;
      qty: number;
      productName: string;
      status: string;
      nextProcess: string;
      machine?: string;
      person?: string;
      process: string;
      plannedStart?: string;
      plannedEnd?: string;
      embellishment?: PmsEmbellishmentRecord;
    }>
  ) => {
    const header = [
      "Order No",
      "Customer",
      "Vas Item",
      "Qty",
      "PMS Product",
      "Status",
      "Next Step",
      "Machine",
      "Person",
      "Process (step)",
      "Planned Start",
      "Planned End",
      "Embelshment",
      "Embelshment Total Time",
    ];

    const values = rows.map((row) => [
      row.orderNo,
      row.customer,
      row.vasName,
      row.qty,
      row.productName,
      row.status,
      row.nextProcess || "-",
      row.machine || "TBD",
      row.person || "TBD",
      row.process,
      formatDateTime(row.plannedStart),
      formatDateTime(row.plannedEnd),
      row.embellishment?.enabled ? "YES" : "NO",
      row.embellishment?.enabled ? row.embellishment?.totalTime || 0 : "",
    ]);

    return [header, ...values];
  };

  const handleOpenRoutingSetup = useCallback((productId?: string) => {
    if (!productId) return;
    setSelectedProductId(productId);
    setActiveTab("routing");
  }, []);

  useEffect(() => {
    if (role && role !== "admin") return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncWorkSheet = async () => {
      if (syncingWorkSheetRef.current) return;
      syncingWorkSheetRef.current = true;
      try {
        const rows = buildWorkSheetRows(workSheetStepRows);
        const payloadHash = JSON.stringify(rows);
        if (payloadHash === lastWorkSheetPayloadRef.current) {
          return;
        }
        await fetch("/api/pms/syncWorkSheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        lastWorkSheetPayloadRef.current = payloadHash;
      } catch (error) {
        console.error("PMS work sheet sync failed:", error);
      } finally {
        syncingWorkSheetRef.current = false;
      }
    };

    syncWorkSheet();
    intervalId = setInterval(syncWorkSheet, 60_000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [role, workSheetStepRows]);

  useEffect(() => {
    if (role && role !== "admin") return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runAutoAdvance = async () => {
      if (autoAdvanceRef.current) return;
      autoAdvanceRef.current = true;
      try {
        await fetch("/api/pms/autoAdvance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("PMS auto-advance failed:", error);
      } finally {
        autoAdvanceRef.current = false;
      }
    };

    runAutoAdvance();
    intervalId = setInterval(runAutoAdvance, AUTO_ADVANCE_POLL_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [role]);

  const handleCloseCreateJobDialog = () => {
    setCreateJobDialog({
      open: false,
      row: null,
      embellishmentEnabled: false,
      form: emptyEmbellishmentForm,
    });
  };

  const prepareCreateJobEditor = (
    row: CreateJobDialogRow,
    open: boolean,
    options?: { allowExistingJobs?: boolean }
  ) => {
    if (
      runningAutopilot ||
      runningPriorityReplan ||
      resettingAutopilot ||
      priorityUpdatingOrderId ||
      deletingPlanKey
    ) {
      return;
    }
    if (!row?.invoiceReady) {
      toast({
        variant: "destructive",
        title: "Invoice required",
        description: "Generate an invoice for this order before creating PMS jobs.",
      });
      return;
    }
    if (!row?.matchedProductId) {
      toast({
        variant: "destructive",
        title: "No PMS product match",
        description: "Create a PMS product with the same name as the VAS item, then try again.",
      });
      return;
    }
    if (!row.hasRouting && open) {
      toast({
        variant: "destructive",
        title: "Routing not created",
        description:
          role === "admin"
            ? "Create routing for this PMS product first, then create jobs."
            : "Ask admin to create routing for this PMS product first.",
      });
      if (role === "admin") {
        handleOpenRoutingSetup(row.matchedProductId);
      }
      return;
    }
    if (row.hasJobsForProduct && !options?.allowExistingJobs) {
      toast({
        title: "Jobs already exist",
        description: "PMS jobs are already created for this VAS item.",
      });
      return;
    }
    const existing = row.embellishment;
    setCreateJobDialog({
      open,
      row,
      embellishmentEnabled: Boolean(existing?.enabled),
      form: buildEmbellishmentForm(row, existing),
    });
  };

  const handleOpenCreateJobDialog = (row: CreateJobDialogRow) => {
    prepareCreateJobEditor(row, true);
  };

  const handleSelectEmbellishmentRow = (row: CreateJobDialogRow) => {
    prepareCreateJobEditor(row, false, { allowExistingJobs: true });
  };

  const handleCreateJobDialogFieldChange = (
    field: keyof EmbellishmentFormValues,
    value: string
  ) => {
    setCreateJobDialog((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        [field]: value,
      },
    }));
  };

  const persistEmbellishmentForRow = async (
    row: CreateJobDialogRow,
    embellishment: StoredEmbellishment
  ) => {
    const nowIso = new Date().toISOString();
    await setDoc(
      doc(db, "pmsEmbellishment", row.key),
      {
        ...embellishment,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customer: row.customer,
        customerPhone: row.customerPhone || embellishment.customerPhone || "",
        vasName: row.vasName,
        vasIndex: row.vasIndex,
        productId: row.matchedProductId || "",
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: {
          id: user?.id || null,
          name: user?.name || null,
          role: user?.role || null,
        },
      },
      { merge: true }
    );
  };

  const getValidatedEmbellishmentPayload = () => {
    if (!createJobDialog.embellishmentEnabled) return undefined;

    const customerName = createJobDialog.form.customerName.trim();
    const customerPhone = createJobDialog.form.customerPhone.trim();
    const numberOfWindows = toNumber(createJobDialog.form.numberOfWindows);
    const numberOfPanels = toNumber(createJobDialog.form.numberOfPanels);
    const embellishmentBarcode = createJobDialog.form.embellishmentBarcode.trim();
    const stitchingPerPanel = toNumber(createJobDialog.form.stitchingPerPanel);
    const handWorkTime = toNumber(createJobDialog.form.handWorkTime);

    if (
      !customerName ||
      !customerPhone ||
      numberOfWindows <= 0 ||
      numberOfPanels <= 0 ||
      !embellishmentBarcode ||
      stitchingPerPanel <= 0 ||
      handWorkTime < 0
    ) {
      toast({
        variant: "destructive",
        title: "Embelshment form incomplete",
        description:
          "Fill customer, windows, panels, barcode, stitching per panel, and hand work time.",
      });
      return null;
    }

    return {
      enabled: true,
      customerName,
      customerPhone,
      numberOfWindows,
      numberOfPanels,
      embellishmentBarcode,
      stitchingPerPanel,
      handWorkTime,
      totalHours: createJobTotals.totalHours,
      totalTime: createJobTotals.totalMinutes,
      hourlyCharge: createJobTotals.hourlyCharge,
      chargeAmount: createJobTotals.chargeAmount,
    } satisfies StoredEmbellishment;
  };

  const handleSaveEmbellishmentDetails = async () => {
    const row = createJobDialog.row;
    if (!row) return;
    const embellishmentPayload = getValidatedEmbellishmentPayload();
    if (embellishmentPayload === null) return;
    if (!embellishmentPayload) {
      toast({
        title: "Enable Embelshment work",
        description: "Turn on Embelshment work to save the dashboard form.",
      });
      return;
    }

    setCreatingJobKey(row.key);
    try {
      await persistEmbellishmentForRow(row, embellishmentPayload);
      toast({
        title: "Embelshment details saved",
        description: `Saved ${row.vasName} with total time ${embellishmentPayload.totalTime} min and charge ${embellishmentPayload.chargeAmount}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: (error as Error).message,
      });
    } finally {
      setCreatingJobKey(null);
    }
  };

  const handleSubmitCreateJobs = async () => {
    const row = createJobDialog.row;
    if (!row) return;
    const qty = Number(row.qty) || 1;
    let embellishmentPayload: StoredEmbellishment | undefined;

    if (createJobDialog.embellishmentEnabled) {
      embellishmentPayload = getValidatedEmbellishmentPayload() || undefined;
      if (embellishmentPayload === undefined && createJobDialog.embellishmentEnabled) {
        return;
      }
    }

    setCreatingJobKey(row.key);
    try {
      if (embellishmentPayload) {
        await persistEmbellishmentForRow(row, embellishmentPayload);
      }

      const createRes = await fetch("/api/pms/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: row.orderId,
          productId: row.matchedProductId,
          qty,
          embellishment: embellishmentPayload,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData?.success) {
        throw new Error(createData?.message || "Failed to create PMS jobs.");
      }

      await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: row.orderId }),
      });

      toast({
        title: "PMS jobs created",
        description: embellishmentPayload
          ? `Scheduled ${row.vasName} with Embelshment work (Total Time: ${embellishmentPayload.totalTime} min, Charge: ${embellishmentPayload.chargeAmount}).`
          : `Scheduled ${row.vasName} (Qty: ${qty}).`,
      });
      handleCloseCreateJobDialog();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PMS creation failed",
        description: (error as Error).message,
      });
    } finally {
      setCreatingJobKey(null);
    }
  };

  const deleteDocsInBatches = async (refs: Array<ReturnType<typeof doc>>) => {
    const chunkSize = 450;
    let deleted = 0;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = refs.slice(i, i + chunkSize);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  };

  const handleResetAndRerunAutopilot = async () => {
    if (
      resettingAutopilot ||
      runningAutopilot ||
      runningPriorityReplan ||
      priorityUpdatingOrderId ||
      deletingPlanKey
    )
      return;
    setResettingAutopilot(true);
    try {
      const jobGroupMap = new Map<
        string,
        {
          orderId: string;
          productId: string;
          qty: number;
          embellishment?: StoredEmbellishment;
        }
      >();
      let skipped = 0;
      liveVasRowsAll.forEach((row) => {
        if (!row.matchedProductId) {
          skipped += 1;
          return;
        }
        const qty = Number(row.qty) || 1;
        const key = `${row.orderId}_${row.matchedProductId}`;
        const existing = jobGroupMap.get(key);
        if (existing) {
          existing.qty += qty;
          if (!existing.embellishment && row.embellishment?.enabled) {
            existing.embellishment = row.embellishment;
          }
        } else {
          jobGroupMap.set(key, {
            orderId: row.orderId,
            productId: row.matchedProductId,
            qty,
            embellishment: row.embellishment?.enabled ? row.embellishment : undefined,
          });
        }
      });

      const [allJobsSnap, allPlansSnap] = await Promise.all([
        getDocs(collection(db, "jobs")),
        getDocs(collection(db, "plan")),
      ]);
      const jobRefs = allJobsSnap.docs.map((jobDoc) => doc(db, "jobs", jobDoc.id));
      const planRefs = allPlansSnap.docs.map((planDoc) => doc(db, "plan", planDoc.id));
      const [deletedJobs, deletedPlans] = await Promise.all([
        deleteDocsInBatches(jobRefs),
        deleteDocsInBatches(planRefs),
      ]);

      let createdGroups = 0;
      let failedGroups = 0;
      for (const group of jobGroupMap.values()) {
        try {
          const createRes = await fetch("/api/pms/createOrder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: group.orderId,
              productId: group.productId,
              qty: group.qty,
              embellishment: group.embellishment,
            }),
          });
          const createData = await createRes.json().catch(() => ({}));
          if (!createRes.ok || !createData?.success) {
            throw new Error(createData?.message || "Failed to create PMS jobs.");
          }
          createdGroups += 1;
        } catch (error) {
          console.error("PMS reset create failed:", error);
          failedGroups += 1;
        }
      }

      const runRes = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const runData = await runRes.json().catch(() => ({}));
      if (!runRes.ok || !runData?.success) {
        throw new Error(runData?.message || "Failed to run autopilot.");
      }

      let description = `Deleted ${deletedJobs} jobs and ${deletedPlans} plan(s).`;
      if (jobGroupMap.size > 0) {
        description += ` Created ${createdGroups}/${jobGroupMap.size} job group(s).`;
      } else {
        description += " No job groups to create.";
      }
      description += ` Planned ${runData?.planned ?? 0} job(s).`;
      if (skipped > 0) {
        description += ` Skipped ${skipped} item(s) without PMS product match.`;
      }
      if (failedGroups > 0) {
        description += ` ${failedGroups} group(s) failed to create.`;
      }

      toast({
        title: "Autopilot reset complete",
        description,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Autopilot reset failed",
        description: (error as Error).message,
      });
    } finally {
      setResettingAutopilot(false);
      setResetAutopilotDialogOpen(false);
    }
  };

  const handleRunAutopilot = async () => {
    if (resettingAutopilot || runningPriorityReplan || priorityUpdatingOrderId || deletingPlanKey)
      return;
    setRunningAutopilot(true);
    try {
      const res = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to run autopilot.");
      }
      toast({
        title: "Autopilot run",
        description:
          data?.planned && data.planned > 0
            ? `Planned ${data.planned} job(s).`
            : data?.message || "No new plans. Check the Not Scheduled Reason column.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Autopilot failed",
        description: (error as Error).message,
      });
    } finally {
      setRunningAutopilot(false);
    }
  };

  const handleRunPriorityReplan = async () => {
    if (resettingAutopilot || runningAutopilot || priorityUpdatingOrderId || deletingPlanKey)
      return;
    setRunningPriorityReplan(true);
    try {
      const res = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to replan.");
      }
      toast({
        title: "Priority replan complete",
        description:
          data?.planned && data.planned > 0
            ? `Replanned ${data.planned} job(s) including planned queue.`
            : data?.message || "No changes were required.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Priority replan failed",
        description: (error as Error).message,
      });
    } finally {
      setRunningPriorityReplan(false);
    }
  };

  const handleSetOrderEmergencyPriority = async (orderId: string, emergency: boolean) => {
    if (!orderId || runningAutopilot || runningPriorityReplan || resettingAutopilot || deletingPlanKey) return;
    setPriorityUpdatingOrderId(orderId);
    try {
      await setDoc(
        doc(db, "orders", orderId),
        {
          priority: emergency ? -100 : 500,
          pmsPriorityTag: emergency ? "EMERGENCY" : "NORMAL",
          pmsPriorityUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const replanRes = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: true }),
      });
      const replanData = await replanRes.json().catch(() => ({}));
      if (!replanRes.ok || !replanData?.success) {
        throw new Error(replanData?.message || "Priority updated, but replan failed.");
      }

      toast({
        title: emergency ? "Marked as emergency" : "Emergency cleared",
        description:
          replanData?.planned && replanData.planned > 0
            ? `Priority reapplied and ${replanData.planned} job(s) replanned.`
            : "Priority updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Priority update failed",
        description: (error as Error).message,
      });
    } finally {
      setPriorityUpdatingOrderId(null);
    }
  };

  const handleDeletePlannedWork = async (row: {
    key: string;
    vasName: string;
    orderNo: string;
    resetJobIds: string[];
    resetPlanDocIds: string[];
    status: string;
  }) => {
    if (
      deletingPlanKey ||
      runningAutopilot ||
      runningPriorityReplan ||
      resettingAutopilot ||
      priorityUpdatingOrderId
    ) {
      return;
    }
    if (row.status === "IN_PROGRESS") {
      toast({
        variant: "destructive",
        title: "Cannot delete in-progress plan",
        description: "Complete or pause the current step before deleting planned work.",
      });
      return;
    }

    const uniqueJobIds = Array.from(new Set((row.resetJobIds || []).filter(Boolean)));
    const uniquePlanDocIds = Array.from(new Set((row.resetPlanDocIds || []).filter(Boolean)));
    if (uniqueJobIds.length === 0 && uniquePlanDocIds.length === 0) {
      toast({
        title: "No planned work found",
        description: "This row has no removable planned work.",
      });
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete planned work for Order ${row.orderNo} (${row.vasName})?\n\nThis will remove schedule and reset related jobs to WAITING.`
          );
    if (!confirmed) return;

    setDeletingPlanKey(row.key);
    try {
      const nowIso = new Date().toISOString();
      const ops: Array<{ type: "deletePlan" | "resetJob"; id: string }> = [
        ...uniquePlanDocIds.map((id) => ({ type: "deletePlan" as const, id })),
        ...uniqueJobIds.map((id) => ({ type: "resetJob" as const, id })),
      ];

      const chunkSize = 380; // keep below firestore batch limit
      for (let i = 0; i < ops.length; i += chunkSize) {
        const batch = writeBatch(db);
        const part = ops.slice(i, i + chunkSize);
        part.forEach((op) => {
          if (op.type === "deletePlan") {
            batch.delete(doc(db, "plan", op.id));
            return;
          }
          batch.set(
            doc(db, "jobs", op.id),
            {
              status: "WAITING",
              plannedStart: deleteField(),
              plannedEnd: deleteField(),
              updatedAt: nowIso,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      toast({
        title: "Planned work deleted",
        description: `Reset ${uniqueJobIds.length} step(s) and removed ${uniquePlanDocIds.length} plan record(s).`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete planned work failed",
        description: (error as Error).message,
      });
    } finally {
      setDeletingPlanKey(null);
    }
  };

  const handleOpenManualDoneDialog = (row: {
    key: string;
    currentJobId: string;
    orderId: string;
    orderNo: string;
    customer: string;
    vasName: string;
    process: string;
    qty: number;
    currentStepNo?: number;
    totalSteps: number;
    plannedStart?: string;
    plannedEnd?: string;
  }) => {
    setManualDoneAllQtyReady("yes");
    setManualDoneRemainingQty("");
    setManualDoneReason("");
    setManualDoneDialog({
      open: true,
      row: {
        key: row.key,
        jobId: row.currentJobId,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customer: row.customer,
        vasName: row.vasName,
        process: row.process,
        qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 0,
        stepNo: row.currentStepNo,
        totalSteps: row.totalSteps,
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
      },
    });
  };

  const handleCloseManualDoneDialog = () => {
    if (manualDoneSaving) return;
    setManualDoneDialog({ open: false, row: null });
  };

  const handleSubmitManualDone = async () => {
    if (!manualDoneDialog.row || manualDoneSaving) return;
    const row = manualDoneDialog.row;
    const totalQty = Number(row.qty || 0);
    const allQtyReady = manualDoneAllQtyReady === "yes";
    const parsedRemainingQty = Number(manualDoneRemainingQty || 0);
    const remainingQty = allQtyReady ? 0 : parsedRemainingQty;

    if (!allQtyReady) {
      if (!Number.isFinite(parsedRemainingQty) || parsedRemainingQty <= 0) {
        toast({
          variant: "destructive",
          title: "Remaining qty required",
          description: "Enter a valid remaining qty when all qty is not ready.",
        });
        return;
      }
      if (totalQty > 0 && parsedRemainingQty > totalQty) {
        toast({
          variant: "destructive",
          title: "Remaining qty is too high",
          description: `Remaining qty cannot exceed total qty (${totalQty}).`,
        });
        return;
      }
      if (!manualDoneReason.trim()) {
        toast({
          variant: "destructive",
          title: "Reason required",
          description: "Please provide a reason for remaining qty.",
        });
        return;
      }
    }

    setManualDoneSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const readyQty =
        totalQty > 0 ? Math.max(0, Number((totalQty - remainingQty).toFixed(2))) : undefined;
      const completionPayload = {
        mode: "MANUAL_LAST_STEP" as const,
        isAllQtyReady: allQtyReady,
        totalQty: totalQty > 0 ? totalQty : null,
        readyQty: readyQty ?? null,
        remainingQty: allQtyReady ? 0 : remainingQty,
        remainingReason: allQtyReady ? null : manualDoneReason.trim(),
        completedBy: {
          id: user?.id || null,
          name: user?.name || null,
          role: user?.role || null,
        },
        completedAt: nowIso,
      };

      const jobRef = doc(db, "jobs", row.jobId);
      const jobSnap = await getDoc(jobRef);
      const jobData = jobSnap.exists() ? (jobSnap.data() as any) : {};
      const actualStart =
        String(jobData?.actualStart || "").trim() ||
        String(jobData?.plannedStart || "").trim() ||
        row.plannedStart ||
        nowIso;

      await setDoc(
        jobRef,
        {
          status: "DONE",
          actualStart,
          actualEnd: nowIso,
          updatedAt: nowIso,
          manualCompletion: completionPayload,
          completionMeta: completionPayload,
        },
        { merge: true }
      );

      await addDoc(collection(db, "pmsManualCompletions"), {
        jobId: row.jobId,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customer: row.customer,
        vasItem: row.vasName,
        process: row.process,
        stepNo: row.stepNo || null,
        totalSteps: row.totalSteps || null,
        ...completionPayload,
        createdAt: nowIso,
      });

      await fetch("/api/pms/autoAdvance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      toast({
        title: "Step marked complete",
        description: allQtyReady
          ? "Final step completed with full qty."
          : "Final step completed with remaining qty recorded.",
      });
      setManualDoneDialog({ open: false, row: null });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Manual completion failed",
        description: (error as Error).message,
      });
    } finally {
      setManualDoneSaving(false);
    }
  };

  const handleSaveWorkingHours = async () => {
    if (savingWorkingHours) return;
    setSavingWorkingHours(true);
    try {
      const offsetMinutes = IST_TIMEZONE_OFFSET_MINUTES;
      await setDoc(
        doc(db, "pmsSettings", "workingHours"),
        {
          startTime: workingHours.startTime,
          endTime: workingHours.endTime,
          timezoneOffsetMinutes: offsetMinutes,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setWorkingHours((prev) => ({ ...prev, timezoneOffsetMinutes: offsetMinutes }));
      toast({ title: "✓ Working hours saved" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to save working hours",
        description: (error as Error).message,
      });
    } finally {
      setSavingWorkingHours(false);
    }
  };

  const toggleWorkRow = (rowKey: string) => {
    setExpandedWorkRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  if (role && role !== "admin") {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Access Restricted</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            You do not have admin access to the PMS Control Center. Please contact your administrator.
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    handleAddProduct,
    handleAddCategory,
    handleDeleteProduct,
    handleAddRoutingRow,
    handleStartRoutingCreation,
    handleQuickAddRoutingProcesses,
    handleSaveRouting,
    handleAddMachine,
    handleUpdateMachine,
    handleDeleteMachine,
    handleAddPerson,
    handleUpdatePerson,
    handleDeletePerson,
    handleAddDowntime,
    handleDeleteDowntime,
    updateSkill,
    getSkillAllowed,
    openImportDialog,
    handleImportPreview,
    handleImport,
    exportData,
  } = usePmsConfigActions({
    categories,
    downtimes,
    importState,
    machines,
    newCategoryName,
    newDowntime,
    newMachine,
    newPerson,
    newProduct,
    pmsCategories,
    people,
    products,
    routing,
    routingRows,
    selectedProductId,
    setEditingMachine,
    setEditingPerson,
    setImportState,
    setNewCategoryName,
    setNewDowntime,
    setNewMachine,
    setNewPerson,
    setNewProduct,
    setRoutingRows,
    setSavingRouting,
    setSelectedProductId,
    skills,
    toast,
  });

  const {
    selectedSkillMachine,
    setSelectedSkillMachine,
    selectedSkillPerson,
    setSelectedSkillPerson,
    copyToMachine,
    setCopyToMachine,
    skillSearch,
    setSkillSearch,
    viewFilter,
    setViewFilter,
    getSelectedSkillCount,
    handleBulkUpdateCurrentSelection,
    handleCopySkills,
    handleDeleteAllSkills,
    getUniqueAssignments,
    getGroupedSkills,
  } = usePmsSkillPanel({
    categories,
    getSkillAllowed,
    machines,
    people,
    skills,
    toast,
    updateSkill,
  });

  const viewModel = {
    categories,
    copyToMachine,
    createJobDialog,
    createJobTotals,
    creatingJobKey,
    deleteDialog,
    deletingPlanKey,
    downtimes,
    editingMachine,
    embellishmentSearch,
    exportData,
    filteredEmbellishmentRows,
    filteredMachines,
    filteredProducts,
    filteredWorkDetailRows,
    filteredWorkStatusRows,
    getGroupedSkills,
    getSelectedSkillCount,
    getSkillAllowed,
    getUniqueAssignments,
    handleAddCategory,
    handleAddDowntime,
    handleAddMachine,
    handleAddPerson,
    handleAddProduct,
    handleAddRoutingRow,
    handleBulkUpdateCurrentSelection,
    handleCloseCreateJobDialog,
    handleCloseManualDoneDialog,
    handleCopySkills,
    handleCreateJobDialogFieldChange,
    handleDeleteAllSkills,
    handleDeleteDowntime,
    handleDeleteMachine,
    handleDeletePerson,
    handleDeletePlannedWork,
    handleDeleteProduct,
    handleImport,
    handleImportPreview,
    handleOpenCreateJobDialog,
    handleOpenManualDoneDialog,
    handleOpenRoutingSetup,
    handleQuickAddRoutingProcesses,
    handleResetAndRerunAutopilot,
    handleRunAutopilot,
    handleRunPriorityReplan,
    handleSaveEmbellishmentDetails,
    handleSaveRouting,
    handleSelectEmbellishmentRow,
    handleSetOrderEmergencyPriority,
    handleStartRoutingCreation,
    handleSubmitCreateJobs,
    handleSubmitManualDone,
    handleUpdateMachine,
    importState,
    jobs,
    liveStats,
    liveVasRows,
    machineSearch,
    machines,
    manualDoneAllQtyReady,
    manualDoneDialog,
    manualDoneReason,
    manualDoneRemainingQty,
    manualDoneSaving,
    newCategoryName,
    newDowntime,
    newMachine,
    newPerson,
    newProduct,
    openImportDialog,
    orders,
    people,
    plans,
    priorityUpdatingOrderId,
    productSearch,
    products,
    resetAutopilotDialogOpen,
    resettingAutopilot,
    role,
    routing,
    routingNotEnteredItems,
    routingRows,
    runningAutopilot,
    runningPriorityReplan,
    savingRouting,
    selectedProductId,
    selectedSkillMachine,
    selectedSkillPerson,
    setCopyToMachine,
    setCreateJobDialog,
    setDeleteDialog,
    setEditingMachine,
    setEmbellishmentSearch,
    setImportState,
    setMachineSearch,
    setManualDoneAllQtyReady,
    setManualDoneDialog,
    setManualDoneReason,
    setManualDoneRemainingQty,
    setNewCategoryName,
    setNewDowntime,
    setNewMachine,
    setNewPerson,
    setNewProduct,
    setProductSearch,
    setResetAutopilotDialogOpen,
    setRoutingRows,
    setSelectedProductId,
    setSelectedSkillMachine,
    setSelectedSkillPerson,
    setShowInactiveMachines,
    setSkillSearch,
    setStatusSearch,
    setVasSearch,
    setViewFilter,
    setWorkDetailSearch,
    showInactiveMachines,
    skillSearch,
    skills,
    statusSearch,
    updateSkill,
    vasSearch,
    viewFilter,
    workDetailSearch,
    workStatusSummary,
  };



  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 w-full">
        {/* Header with Stats */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">PMS Control Center</h1>
              <p className="text-muted-foreground mt-1">
                Production Management System configuration and analytics
              </p>
            </div>
            <Badge variant="outline" className="text-sm px-4 py-2">
              <Settings2 className="mr-2 h-4 w-4" />
              Admin Mode
            </Badge>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.products}</div>
                <p className="text-xs text-muted-foreground">{categories.length} categories</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Machines</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeMachines}</div>
                <p className="text-xs text-muted-foreground">of {stats.totalMachines} total</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalCapacity}</div>
                <p className="text-xs text-muted-foreground">minutes per shift</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workforce</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.people}</div>
                <p className="text-xs text-muted-foreground">{stats.downtimeEvents} downtime events</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Working Hours</CardTitle>
              <CardDescription>
                Company working window used for PMS scheduling. End time earlier than start means overnight.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="work-start">Start</Label>
                  <Input
                    id="work-start"
                    type="time"
                    value={workingHours.startTime}
                    onChange={(e) =>
                      setWorkingHours((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-end">End</Label>
                  <Input
                    id="work-end"
                    type="time"
                    value={workingHours.endTime}
                    onChange={(e) =>
                      setWorkingHours((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                  />
                </div>
                <Button onClick={handleSaveWorkingHours} disabled={savingWorkingHours}>
                  {savingWorkingHours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Hours
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Scheduling timezone: IST (UTC+05:30). Stored offset: {workingHours.timezoneOffsetMinutes} minutes.
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-6xl grid-cols-4 md:grid-cols-8">
            <TabsTrigger value="live" className="gap-2">
              <Eye className="h-4 w-4" />
              Live VAS
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Work Status
            </TabsTrigger>
            <TabsTrigger value="work" className="gap-2">
              <ListChecks className="h-4 w-4" />
              Work Detail
            </TabsTrigger>
            <TabsTrigger value="embellishment" className="gap-2">
              <Check className="h-4 w-4" />
              Embelshment
            </TabsTrigger>
            <TabsTrigger value="routing" className="gap-2">
              <Package className="h-4 w-4" />
              Routing
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Machines
            </TabsTrigger>
            <TabsTrigger value="skills" className="gap-2">
              <Users className="h-4 w-4" />
              Skills
            </TabsTrigger>
            <TabsTrigger value="downtime" className="gap-2">
              <Clock className="h-4 w-4" />
              Downtime
            </TabsTrigger>
          </TabsList>

          <PmsOperationsTabs vm={viewModel} />
          <PmsSetupTabs vm={viewModel} />
        </Tabs>

        <PmsDialogs vm={viewModel} />
=======
import { useCallback } from "react";
import { Tabs } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PmsAccessRestricted } from "./components/PmsAccessRestricted";
import { PmsDashboardHeader } from "./components/PmsDashboardHeader";
import { PmsDialogs } from "./components/PmsDialogs";
import { PmsTabsList } from "./components/PmsTabsList";
import { PmsDowntimeTab } from "./components/tabs/PmsDowntimeTab";
import { PmsEmbellishmentTab } from "./components/tabs/PmsEmbellishmentTab";
import { PmsLiveTab } from "./components/tabs/PmsLiveTab";
import { PmsMachinesTab } from "./components/tabs/PmsMachinesTab";
import { PmsRoutingTab } from "./components/tabs/PmsRoutingTab";
import { PmsSkillsTab } from "./components/tabs/PmsSkillsTab";
import { PmsWorkDetailTab } from "./components/tabs/PmsWorkDetailTab";
import { PmsWorkStatusTab } from "./components/tabs/PmsWorkStatusTab";
import { usePmsAdminActions } from "./hooks/usePmsAdminActions";
import { usePmsAutoTasks } from "./hooks/usePmsAutoTasks";
import { usePmsDashboardCore } from "./hooks/usePmsDashboardCore";
import { usePmsJobActions } from "./hooks/usePmsJobActions";
import { usePmsLiveData } from "./hooks/usePmsLiveData";
import { usePmsWorkData } from "./hooks/usePmsWorkData";
import { normalizeText } from "./utils/pmsHelpers";

export default function PmsDashboardClient() {
  const { role, user } = useAuth();
  const { toast } = useToast();

  const core = usePmsDashboardCore();

  const liveData = usePmsLiveData({
    products: core.products,
    pmsCategories: core.pmsCategories,
    routing: core.routing,
    machines: core.machines,
    people: core.people,
    skills: core.skills,
    downtimes: core.downtimes,
    orders: core.orders,
    jobs: core.jobs,
    plans: core.plans,
    embellishmentRecords: core.embellishmentRecords,
    createJobDialog: core.createJobDialog,
    productSearch: core.productSearch,
    machineSearch: core.machineSearch,
    personSearch: core.personSearch,
    showInactiveMachines: core.showInactiveMachines,
    vasSearch: core.vasSearch,
    embellishmentSearch: core.embellishmentSearch,
  });

  const workData = usePmsWorkData({
    jobs: core.jobs,
    orders: core.orders,
    people: core.people,
    machines: core.machines,
    products: core.products,
    routing: core.routing,
    plans: core.plans,
    embellishmentRecords: core.embellishmentRecords,
    workDetailSearch: core.workDetailSearch,
    statusSearch: core.statusSearch,
  });

  const jobActions = usePmsJobActions({
    role,
    user,
    toast,
    liveVasRowsAll: liveData.liveVasRowsAll,
    createJobDialog: core.createJobDialog,
    setCreateJobDialog: core.setCreateJobDialog,
    createJobTotals: liveData.createJobTotals,
    runningAutopilot: core.runningAutopilot,
    runningPriorityReplan: core.runningPriorityReplan,
    resettingAutopilot: core.resettingAutopilot,
    priorityUpdatingOrderId: core.priorityUpdatingOrderId,
    deletingPlanKey: core.deletingPlanKey,
    setCreatingJobKey: core.setCreatingJobKey,
    setResettingAutopilot: core.setResettingAutopilot,
    setResetAutopilotDialogOpen: core.setResetAutopilotDialogOpen,
    setRunningAutopilot: core.setRunningAutopilot,
    setRunningPriorityReplan: core.setRunningPriorityReplan,
    setPriorityUpdatingOrderId: core.setPriorityUpdatingOrderId,
    setDeletingPlanKey: core.setDeletingPlanKey,
    manualDoneDialog: core.manualDoneDialog,
    setManualDoneDialog: core.setManualDoneDialog,
    manualDoneSaving: core.manualDoneSaving,
    setManualDoneSaving: core.setManualDoneSaving,
    manualDoneAllQtyReady: core.manualDoneAllQtyReady,
    setManualDoneAllQtyReady: core.setManualDoneAllQtyReady,
    manualDoneRemainingQty: core.manualDoneRemainingQty,
    setManualDoneRemainingQty: core.setManualDoneRemainingQty,
    manualDoneReason: core.manualDoneReason,
    setManualDoneReason: core.setManualDoneReason,
    setActiveTab: core.setActiveTab,
    setSelectedProductId: core.setSelectedProductId,
  });

  const adminActions = usePmsAdminActions({
    toast,
    categories: liveData.categories,
    products: core.products,
    routing: core.routing,
    routingRows: core.routingRows,
    machines: core.machines,
    people: core.people,
    skills: core.skills,
    downtimes: core.downtimes,
    selectedProductId: core.selectedProductId,
    workingHours: core.workingHours,
    savingWorkingHours: core.savingWorkingHours,
    newProduct: core.newProduct,
    newCategoryName: core.newCategoryName,
    newMachine: core.newMachine,
    newPerson: core.newPerson,
    newDowntime: core.newDowntime,
    importState: core.importState,
    selectedSkillMachine: core.selectedSkillMachine,
    selectedSkillPerson: core.selectedSkillPerson,
    copyToMachine: core.copyToMachine,
    skillSearch: core.skillSearch,
    viewFilter: core.viewFilter,
    setWorkingHours: core.setWorkingHours,
    setSavingWorkingHours: core.setSavingWorkingHours,
    setSelectedProductId: core.setSelectedProductId,
    setRoutingRows: core.setRoutingRows,
    setSavingRouting: core.setSavingRouting,
    setNewProduct: core.setNewProduct,
    setNewCategoryName: core.setNewCategoryName,
    setNewMachine: core.setNewMachine,
    setNewPerson: core.setNewPerson,
    setNewDowntime: core.setNewDowntime,
    setImportState: core.setImportState,
    setEditingMachine: core.setEditingMachine,
    setEditingPerson: core.setEditingPerson,
    setDeleteDialog: core.setDeleteDialog,
    setSelectedSkillMachine: core.setSelectedSkillMachine,
    setSelectedSkillPerson: core.setSelectedSkillPerson,
    setCopyToMachine: core.setCopyToMachine,
  });

  const handleEditWorkDetailEmbellishment = useCallback(
    (row: { orderId: string; productName: string; embellishment?: { productId?: string } }) => {
      const matchedRow = liveData.liveVasRowsAll.find((item: any) => {
        const sameOrder = item.orderId === row.orderId;
        const sameProduct =
          item.matchedProductId === row.embellishment?.productId ||
          normalizeText(item.matchedProductName) === normalizeText(row.productName);
        return sameOrder && sameProduct;
      });

      if (!matchedRow) {
        toast({
          variant: "destructive",
          title: "Unable to open embellishment editor",
          description: "This PMS row could not be matched to an editable embellishment item.",
        });
        return;
      }

      core.setActiveTab("embellishment");
      jobActions.prepareCreateJobEditor(matchedRow, false, { allowExistingJobs: true });
    },
    [core, jobActions, liveData.liveVasRowsAll, toast]
  );

  usePmsAutoTasks({
    role,
    workSheetStepRows: workData.workSheetStepRows,
    syncingWorkSheetRef: core.syncingWorkSheetRef,
    lastWorkSheetPayloadRef: core.lastWorkSheetPayloadRef,
    autoAdvanceRef: core.autoAdvanceRef,
  });

  const ctx = {
    role,
    user,
    ...core,
    ...liveData,
    ...workData,
    ...jobActions,
    ...adminActions,
    handleEditWorkDetailEmbellishment,
  };

  if (role && role !== "admin") {
    return <PmsAccessRestricted />;
  }

  return (
    <TooltipProvider>
      <div className="w-full space-y-4 px-3 py-3 sm:px-4 md:px-5 lg:px-6">
        <PmsDashboardHeader ctx={ctx} />

        <Tabs value={core.activeTab} onValueChange={core.setActiveTab} className="space-y-4">
          <PmsTabsList />
          <PmsLiveTab ctx={ctx} />
          <PmsWorkStatusTab ctx={ctx} />
          <PmsWorkDetailTab ctx={ctx} />
          <PmsEmbellishmentTab ctx={ctx} />
          <PmsRoutingTab ctx={ctx} />
          <PmsMachinesTab ctx={ctx} />
          <PmsSkillsTab ctx={ctx} />
          <PmsDowntimeTab ctx={ctx} />
        </Tabs>

        <PmsDialogs ctx={ctx} />
>>>>>>> 3ba0de6 (pms Fixes and update)
      </div>
    </TooltipProvider>
  );
}
<<<<<<< HEAD



=======
>>>>>>> 3ba0de6 (pms Fixes and update)
