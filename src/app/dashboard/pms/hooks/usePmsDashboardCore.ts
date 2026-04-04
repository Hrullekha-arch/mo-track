"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Order } from "@/lib/types";
import type {
  CreateJobDialogState,
  DeleteDialogState,
  EmbellishmentFormValues,
  ImportState,
  ManualDoneDialogState,
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
} from "../types/pms";
import {
  emptyEmbellishmentForm,
  IST_TIMEZONE_OFFSET_MINUTES,
} from "../utils/pmsHelpers";

export const usePmsDashboardCore = () => {
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
  const [embellishmentRecords, setEmbellishmentRecords] = useState<
    PmsEmbellishmentRecord[]
  >([]);
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
  const [manualDoneDialog, setManualDoneDialog] = useState<ManualDoneDialogState>({
    open: false,
    row: null,
  });
  const [manualDoneAllQtyReady, setManualDoneAllQtyReady] = useState<"yes" | "no">(
    "yes"
  );
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
  const [productSearch, setProductSearch] = useState("");
  const [machineSearch, setMachineSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [editingMachine, setEditingMachine] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    type: "product",
    id: "",
    name: "",
  });
  const [newProduct, setNewProduct] = useState({ name: "", category: "" });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newMachine, setNewMachine] = useState({
    name: "",
    process: "",
    shiftMinutes: "480",
  });
  const [newPerson, setNewPerson] = useState({ name: "", role: "" });
  const [newDowntime, setNewDowntime] = useState({
    machineId: "",
    from: "",
    to: "",
    reason: "",
  });
  const [importState, setImportState] = useState<ImportState>({
    open: false,
    tab: "routing",
    text: "",
    loading: false,
    preview: [],
  });
  const [showInactiveMachines, setShowInactiveMachines] = useState(true);
  const [selectedSkillMachine, setSelectedSkillMachine] = useState<string>("");
  const [selectedSkillPerson, setSelectedSkillPerson] = useState<string>("");
  const [copyToMachine, setCopyToMachine] = useState<string>("");
  const [skillSearch, setSkillSearch] = useState<string>("");
  const [viewFilter, setViewFilter] = useState<string>("all");

  const autoAdvanceRef = useRef(false);
  const syncingWorkSheetRef = useRef(false);
  const lastWorkSheetPayloadRef = useRef("");

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
      setOrders(
        snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) } as Order))
      );
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
    setRoutingRows(rows);
  }, [routing, selectedProductId]);

  return {
    products,
    setProducts,
    pmsCategories,
    setPmsCategories,
    routing,
    setRouting,
    machines,
    setMachines,
    people,
    setPeople,
    skills,
    setSkills,
    downtimes,
    setDowntimes,
    orders,
    setOrders,
    jobs,
    setJobs,
    plans,
    setPlans,
    embellishmentRecords,
    setEmbellishmentRecords,
    activeTab,
    setActiveTab,
    vasSearch,
    setVasSearch,
    statusSearch,
    setStatusSearch,
    workDetailSearch,
    setWorkDetailSearch,
    embellishmentSearch,
    setEmbellishmentSearch,
    creatingJobKey,
    setCreatingJobKey,
    runningAutopilot,
    setRunningAutopilot,
    runningPriorityReplan,
    setRunningPriorityReplan,
    resettingAutopilot,
    setResettingAutopilot,
    resetAutopilotDialogOpen,
    setResetAutopilotDialogOpen,
    expandedWorkRows,
    setExpandedWorkRows,
    priorityUpdatingOrderId,
    setPriorityUpdatingOrderId,
    deletingPlanKey,
    setDeletingPlanKey,
    manualDoneDialog,
    setManualDoneDialog,
    manualDoneAllQtyReady,
    setManualDoneAllQtyReady,
    manualDoneRemainingQty,
    setManualDoneRemainingQty,
    manualDoneReason,
    setManualDoneReason,
    manualDoneSaving,
    setManualDoneSaving,
    createJobDialog,
    setCreateJobDialog,
    workingHours,
    setWorkingHours,
    savingWorkingHours,
    setSavingWorkingHours,
    selectedProductId,
    setSelectedProductId,
    routingRows,
    setRoutingRows,
    savingRouting,
    setSavingRouting,
    productSearch,
    setProductSearch,
    machineSearch,
    setMachineSearch,
    personSearch,
    setPersonSearch,
    editingMachine,
    setEditingMachine,
    editingPerson,
    setEditingPerson,
    deleteDialog,
    setDeleteDialog,
    newProduct,
    setNewProduct,
    newCategoryName,
    setNewCategoryName,
    newMachine,
    setNewMachine,
    newPerson,
    setNewPerson,
    newDowntime,
    setNewDowntime,
    importState,
    setImportState,
    showInactiveMachines,
    setShowInactiveMachines,
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
    autoAdvanceRef,
    syncingWorkSheetRef,
    lastWorkSheetPayloadRef,
  };
};
