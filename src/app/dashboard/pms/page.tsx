"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  Search,
  Download,
  Upload,
  Edit2,
  Check,
  X,
  GripVertical,
  Settings2,
  Users,
  Clock,
  Package,
  AlertCircle,
  TrendingUp,
  FileJson,
  Copy,
  Eye,
  EyeOff,
  ListChecks,
  Activity,
  Zap,
  Filter,
  RefreshCw,
  Cpu,
  UserCheck,
  BarChart2,
  ChevronDown,
  ChevronUp,
  PlayCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Order } from "@/lib/types";
import {
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  IST_TIME_ZONE,
} from "@/lib/pms/time";
import { WorkStatusPanel } from "@/components/features/pms/WorkStatusPanel";


type PmsProduct = { id: string; name: string; category: string };
type PmsRouting = { id: string; productId: string; stepNo: number; process: string; cycleMinutes: number; ops: number };
type PmsMachine = { id: string; name: string; process: string; shiftMinutes: number; active: boolean };
type PmsPerson = { id: string; name: string; role?: string };
type PmsSkill = {
  id: string;
  machineId: string;
  personId: string;
  process: string;
  category: string;
  allowed: boolean;
};
type PmsDowntime = { id: string; machineId: string; from: string; to: string; reason?: string };
type PmsJob = {
  id: string;
  orderId: string;
  jobGroupId?: string;
  productId?: string;
  stepNo?: number;
  process?: string;
  requiredMinutes?: number;
  status?: "WAITING" | "PLANNED" | "IN_PROGRESS" | "DONE";
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  updatedAt?: string;
};
type PmsPlan = {
  id: string;
  jobId: string;
  machineId: string;
  personId: string;
  plannedStart?: string;
  plannedEnd?: string;
};

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const IST_TIMEZONE_OFFSET_MINUTES = 330;
const AUTO_ADVANCE_POLL_MS = 15_000;

const formatDateTime = (value?: string) => {
  return formatDateTimeInZone(value, {
    timeZone: IST_TIME_ZONE,
    placeholder: "-",
  });
};

const getQueueDelayLabel = (startIso?: string) => {
  if (!startIso) return "";
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return "";
  const diffMs = startMs - Date.now();
  if (diffMs <= 0) return "Ready now";
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `Queue starts in ${minutes}m`;
  return `Queue starts in ${hours}h ${minutes}m`;
};

const normalizeText = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

const buildSkillId = (machineId: string, personId: string, category: string) =>
  `${machineId}_${personId}_${category.replace(/[^a-zA-Z0-9]/g, "_")}`;

export default function PmsPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<PmsProduct[]>([]);
  const [routing, setRouting] = useState<PmsRouting[]>([]);
  const [machines, setMachines] = useState<PmsMachine[]>([]);
  const [people, setPeople] = useState<PmsPerson[]>([]);
  const [skills, setSkills] = useState<PmsSkill[]>([]);
  const [downtimes, setDowntimes] = useState<PmsDowntime[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<PmsJob[]>([]);
  const [plans, setPlans] = useState<PmsPlan[]>([]);
  const [vasSearch, setVasSearch] = useState("");
  const [vasStatusFilter, setVasStatusFilter] = useState<string>("ALL");
  const [workingHoursExpanded, setWorkingHoursExpanded] = useState(false);
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



    return () => {
      unsubProducts();
      unsubRouting();
      unsubMachines();
      unsubPeople();
      unsubSkills();
      unsubDowntime();
      unsubOrders();
      unsubJobs();
      unsubPlans();
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
    setRoutingRows(rows.length ? rows : []);
  }, [routing, selectedProductId]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))),
    [products]
  );

  // Filtered data
  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
        m.process.toLowerCase().includes(machineSearch.toLowerCase());
      const matchesActive = showInactiveMachines || m.active;
      return matchesSearch && matchesActive;
    });
  }, [machines, machineSearch, showInactiveMachines]);

  const filteredPeople = useMemo(() => {
    return people.filter((p) =>
      p.name.toLowerCase().includes(personSearch.toLowerCase()) ||
      (p.role?.toLowerCase() || "").includes(personSearch.toLowerCase())
    );
  }, [people, personSearch]);

  // Statistics
  const stats = useMemo(() => {
    const activeMachines = machines.filter((m) => m.active).length;
    const totalCapacity = machines
      .filter((m) => m.active)
      .reduce((sum, m) => sum + m.shiftMinutes, 0);
    
    return {
      products: products.length,
      activeMachines,
      totalMachines: machines.length,
      people: people.length,
      totalCapacity,
      downtimeEvents: downtimes.length,
    };
  }, [products, machines, people, downtimes]);

  const isOrderInvoiced = useCallback((order?: Order) => {
    if (!order) return false;
    if (order.invoicing?.invoiceRequired === false) return true;
    const status = order.invoicing?.status;
    const invoices = order.invoicing?.invoices || [];
    if (status && status !== "NOT_INVOICED") return true;
    return Array.isArray(invoices) && invoices.length > 0;
  }, []);

  const isOrderClosedForPms = useCallback((order?: Order) => {
    if (!order) return false;
    const workflowStatus = String((order as any)?.workflow?.status || "")
      .trim()
      .toUpperCase();
    if (workflowStatus === "COMPLETED" || workflowStatus === "CANCELLED") return true;
    const status = String((order as any)?.status || "")
      .trim()
      .toUpperCase();
    return status === "INSTALLATION DONE" || status === "COMPLETED" || status === "CANCELLED";
  }, []);

  const liveVasRowsAll = useMemo(() => {
    const planByJob = new Map(plans.map((plan) => [plan.jobId, plan]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const personById = new Map(people.map((person) => [person.id, person]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
      routingByProduct.get(step.productId)!.push(step);
    });

    const toGroupKey = (orderId: string, productId?: string, jobGroupId?: string) =>
      jobGroupId || (productId ? `${orderId}_${productId}` : orderId);

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const groupKey = toGroupKey(job.orderId, job.productId, job.jobGroupId);
      if (!jobsByGroup.has(groupKey)) jobsByGroup.set(groupKey, []);
      jobsByGroup.get(groupKey)!.push(job);
    });

    const getJobBucket = (groupKey: string) => {
      const bucket = jobsByGroup.get(groupKey) || [];
      const sorted = [...bucket].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
      const inProgress = sorted.find((job) => job.status === "IN_PROGRESS");
      const planned = sorted.find((job) => job.status === "PLANNED");
      const waiting = sorted.find((job) => job.status === "WAITING");
      const nextJob = inProgress || planned || waiting || null;
      const nextPlan = nextJob ? planByJob.get(nextJob.id) : null;
      const etaFromJobs = sorted
        .map((job) => job.plannedEnd)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      return { sorted, inProgress, nextJob, nextPlan, etaFromJobs };
    };

    const explainNoPlan = (
      productId?: string,
      hasJobs?: boolean,
      waitingJob?: PmsJob,
      prevJob?: PmsJob,
      invoiceReady?: boolean
    ) => {
      if (!invoiceReady) return "Invoice not generated";
      if (!productId) return "No PMS product match";
      if (!hasJobs) return "Jobs not created";
      if (waitingJob && prevJob && prevJob.status !== "DONE") {
        return "Previous step pending";
      }
      const product = productById.get(productId);
      if (!product?.category) return "Missing product category";
      const steps = routingByProduct.get(productId) || [];
      if (steps.length === 0) return "No routing for product";
      if (waitingJob?.process) {
        const routingProcesses = new Set(steps.map((step) => normalizeText(step.process)));
        if (!routingProcesses.has(normalizeText(waitingJob.process))) {
          return "Routing changed — recreate jobs";
        }
      }

      const processKey = normalizeText(waitingJob?.process || steps[0]?.process || "");
      if (!processKey) return "Job missing process";

      const eligibleMachines = machines.filter(
        (machine) =>
          machine.active !== false && normalizeText(machine.process) === processKey
      );
      if (eligibleMachines.length === 0) return "No machine for process";

      const machineIds = new Set(eligibleMachines.map((machine) => machine.id));
      const categoryKey = normalizeText(product.category);
      const skillMatch = skills.some(
        (skill) =>
          skill.allowed &&
          machineIds.has(skill.machineId) &&
          normalizeText(skill.process) === processKey &&
          normalizeText(skill.category) === categoryKey
      );
      if (!skillMatch) return "No skill match";

      return "Waiting for slot";
    };

    const rows = orders
      .filter(
        (order) =>
          (order.sections?.VAS?.items?.length || 0) > 0 && !isOrderClosedForPms(order)
      )
      .flatMap((order) => {
        return (order.sections?.VAS?.items || []).map((item, index) => {
          const vasName = item.description || item.group || "VAS";
          const searchCandidates = [
            vasName,
            item.group,
            item.roomName,
            item.type,
          ].filter(Boolean) as string[];
          const match =
            products.find((product) => normalizeText(product.name) === normalizeText(vasName)) ||
            products.find((product) =>
              searchCandidates.some((candidate) => {
                const left = normalizeText(candidate);
                const right = normalizeText(product.name);
                return left === right || left.includes(right) || right.includes(left);
              })
            );
          const groupKey = toGroupKey(order.id, match?.id);
          const jobBucket = getJobBucket(groupKey);
          const status = jobBucket.inProgress?.status || jobBucket.nextJob?.status || "WAITING";
          const currentProcess = jobBucket.inProgress?.process || jobBucket.nextJob?.process || "Not scheduled";
          const stepNo = jobBucket.inProgress?.stepNo ?? jobBucket.nextJob?.stepNo;
          const plannedStart = jobBucket.nextPlan?.plannedStart;
          const plannedEnd = jobBucket.nextPlan?.plannedEnd;
          const eta = order.pmsEta || jobBucket.etaFromJobs || plannedEnd;
          const machineName = jobBucket.nextPlan?.machineId
            ? machineById.get(jobBucket.nextPlan.machineId)?.name
            : undefined;
          const personName = jobBucket.nextPlan?.personId
            ? personById.get(jobBucket.nextPlan.personId)?.name
            : undefined;
          const invoiceReady = isOrderInvoiced(order);
          const hasJobsForProduct = match
            ? jobs.some((job) => job.orderId === order.id && job.productId === match.id)
            : false;
          const waitingJob =
            jobBucket.nextJob?.status === "WAITING" ? jobBucket.nextJob : undefined;
          const prevJob =
            waitingJob && waitingJob.stepNo !== undefined
              ? jobBucket.sorted.find((job) => job.stepNo === waitingJob.stepNo! - 1)
              : undefined;
          const noPlanReason =
            status === "WAITING" && !plannedStart
              ? explainNoPlan(match?.id, hasJobsForProduct, waitingJob, prevJob, invoiceReady)
              : "";
          const rawPriority = Number((order as any)?.priority);
          const orderPriority = Number.isFinite(rawPriority) ? rawPriority : 500;
          const isEmergency = orderPriority <= -100;
          const priorityLabel = isEmergency
            ? "Emergency"
            : orderPriority <= 0
            ? "High"
            : orderPriority <= 500
            ? "Normal"
            : "Low";

          return {
            key: `${order.id}-vas-${index}`,
            orderId: order.id,
            orderNo: order.crmOrderNo || order.orderNo || order.id,
            customer: order.customerSnapshot?.name || order.customerName || "N/A",
            vasName,
            qty: item.qty ?? item.quantity ?? 0,
            group: item.group || "-",
            status,
            currentProcess: stepNo ? `${currentProcess} (Step ${stepNo})` : currentProcess,
            nextProcess: jobBucket.nextJob && jobBucket.inProgress ? jobBucket.nextJob.process : undefined,
            machineName: machineName || "TBD",
            personName: personName || "TBD",
            plannedStart,
            plannedEnd,
            eta,
            lastUpdate:
              jobBucket.inProgress?.updatedAt ||
              jobBucket.nextJob?.updatedAt ||
              (order as any).updatedAt ||
              order.createdAt,
            matchedProductId: match?.id,
            matchedProductName: match?.name,
            hasJobsForProduct,
            noPlanReason,
            invoiceReady,
            orderPriority,
            priorityLabel,
            isEmergency,
          };
        });
      });
    return rows;
  }, [orders, jobs, plans, machines, people, products, routing, skills, isOrderInvoiced, isOrderClosedForPms]);

  const liveVasRows = useMemo(() => {
    const search = vasSearch.trim().toLowerCase();
    const filtered = search
      ? liveVasRowsAll.filter((row) =>
          [row.orderNo, row.customer, row.vasName, row.machineName, row.personName, row.group]
            .join(" ")
            .toLowerCase()
            .includes(search)
        )
      : liveVasRowsAll;

    const rank: Record<string, number> = { IN_PROGRESS: 0, PLANNED: 1, WAITING: 2, DONE: 3 };
    return [...filtered].sort((a, b) => {
      const statusRankDiff = (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
      if (statusRankDiff !== 0) return statusRankDiff;
      if (a.orderPriority !== b.orderPriority) return a.orderPriority - b.orderPriority;
      const aTime = a.plannedStart ? new Date(a.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart ? new Date(b.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [liveVasRowsAll, vasSearch]);

  const liveStats = useMemo(() => {
    const totalItems = liveVasRows.length;
    const inProgress = liveVasRows.filter((row) => row.status === "IN_PROGRESS").length;
    const planned = liveVasRows.filter((row) => row.status === "PLANNED").length;
    const waiting = liveVasRows.filter((row) => row.status === "WAITING").length;
    const done = liveVasRows.filter((row) => row.status === "DONE").length;
    const emergency = liveVasRows.filter((row) => row.isEmergency).length;
    return { totalItems, inProgress, planned, waiting, done, emergency };
  }, [liveVasRows]);

  const liveVasRowsFiltered = useMemo(() => {
    if (vasStatusFilter === "ALL") return liveVasRows;
    if (vasStatusFilter === "EMERGENCY") return liveVasRows.filter((r) => r.isEmergency);
    return liveVasRows.filter((r) => r.status === vasStatusFilter);
  }, [liveVasRows, vasStatusFilter]);

  const workStatusData = useMemo(() => {
    const vasEligibleOrders = orders.filter(
      (order) => ((order.sections as any)?.VAS?.items?.length || 0) > 0
    );
    const completedOrders = vasEligibleOrders.filter((order) => isOrderClosedForPms(order)).length;

    const orderRowsMap = new Map<
      string,
      {
        orderId: string;
        orderNo: string;
        customer: string;
        statuses: Set<string>;
        lastUpdate?: string;
      }
    >();

    liveVasRowsAll.forEach((row) => {
      const status = String(row.status || "WAITING").trim().toUpperCase();
      const existing = orderRowsMap.get(row.orderId);
      if (!existing) {
        orderRowsMap.set(row.orderId, {
          orderId: row.orderId,
          orderNo: row.orderNo,
          customer: row.customer,
          statuses: new Set([status]),
          lastUpdate: row.lastUpdate,
        });
        return;
      }
      existing.statuses.add(status);
      const existingMs = existing.lastUpdate ? new Date(existing.lastUpdate).getTime() : -Infinity;
      const nextMs = row.lastUpdate ? new Date(row.lastUpdate).getTime() : -Infinity;
      if (nextMs > existingMs) {
        existing.lastUpdate = row.lastUpdate;
      }
    });

    const rows = Array.from(orderRowsMap.values()).map((entry) => {
      const statuses = Array.from(entry.statuses);
      const hasInProgress = statuses.includes("IN_PROGRESS");
      const hasPlanned = statuses.includes("PLANNED");
      const hasWaiting = statuses.includes("WAITING");
      const allDone = statuses.length > 0 && statuses.every((status) => status === "DONE");

      let bucket: "Pending" | "Machine Running" | "Qc Pending" | "Dispatch ready" = "Pending";
      if (hasInProgress) bucket = "Machine Running";
      else if (hasPlanned) bucket = "Qc Pending";
      else if (hasWaiting) bucket = "Pending";
      else if (allDone) bucket = "Dispatch ready";

      return {
        ...entry,
        bucket,
        statuses,
      };
    });

    const counts = rows.reduce(
      (acc, row) => {
        if (row.bucket === "Pending") acc.pending += 1;
        if (row.bucket === "Machine Running") acc.machineRunning += 1;
        if (row.bucket === "Qc Pending") acc.qcPending += 1;
        if (row.bucket === "Dispatch ready") acc.dispatchReady += 1;
        return acc;
      },
      { pending: 0, machineRunning: 0, qcPending: 0, dispatchReady: 0 }
    );

    const bucketRank: Record<string, number> = {
      "Machine Running": 0,
      "Qc Pending": 1,
      Pending: 2,
      "Dispatch ready": 3,
    };

    rows.sort((a, b) => {
      const bucketDiff = (bucketRank[a.bucket] ?? 99) - (bucketRank[b.bucket] ?? 99);
      if (bucketDiff !== 0) return bucketDiff;
      const aTime = a.lastUpdate ? new Date(a.lastUpdate).getTime() : -Infinity;
      const bTime = b.lastUpdate ? new Date(b.lastUpdate).getTime() : -Infinity;
      return bTime - aTime;
    });

    return {
      cards: [
        { key: "totalOrders", label: "Total Orders", value: vasEligibleOrders.length },
        { key: "pending", label: "Pending", value: counts.pending },
        { key: "machineRunning", label: "Machine Running", value: counts.machineRunning },
        { key: "qcPending", label: "Qc Pending", value: counts.qcPending },
        { key: "dispatchReady", label: "Dispatch ready", value: counts.dispatchReady },
        { key: "completed", label: "Completed", value: completedOrders },
      ],
      rows,
    };
  }, [orders, liveVasRowsAll, isOrderClosedForPms]);

  const resolveVasInfo = useCallback((order?: Order, productName?: string) => {
    const items = (order?.sections as any)?.VAS?.items || [];
    if (!items.length) {
      return { vasName: productName || "VAS", vasGroup: "-", qty: 0 };
    }
    if (!productName) {
      const fallback = items[0] || {};
      return {
        vasName: fallback.description || fallback.group || "VAS",
        vasGroup: fallback.group || "-",
        qty: fallback.qty ?? fallback.quantity ?? 0,
      };
    }
    const productKey = normalizeText(productName);
    const exactMatch = items.find(
      (item: any) => normalizeText(item.description || item.group || "") === productKey
    );
    if (exactMatch) {
      return {
        vasName: exactMatch.description || exactMatch.group || productName,
        vasGroup: exactMatch.group || "-",
        qty: exactMatch.qty ?? exactMatch.quantity ?? 0,
      };
    }
    const fuzzyMatch = items.find((item: any) => {
      const candidates = [
        item.description,
        item.group,
        item.roomName,
        item.type,
      ].filter(Boolean) as string[];
      return candidates.some((candidate) => {
        const left = normalizeText(candidate);
        return left === productKey || left.includes(productKey) || productKey.includes(left);
      });
    });
    const matched = fuzzyMatch || items[0] || {};
    return {
      vasName: matched.description || matched.group || productName,
      vasGroup: matched.group || "-",
      qty: matched.qty ?? matched.quantity ?? 0,
    };
  }, []);

  const workDetailRows = useMemo(() => {
    const nowMs = Date.now();
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
      routingByProduct.get(step.productId)!.push(step);
    });
    routingByProduct.forEach((steps, key) => {
      routingByProduct.set(
        key,
        [...steps].sort((a, b) => a.stepNo - b.stepNo)
      );
    });

    const planDocIdsByJob = new Map<string, string[]>();
    plans.forEach((plan) => {
      const jobId = String((plan as any)?.jobId || "").trim();
      const planId = String((plan as any)?.id || "").trim();
      if (!jobId || !planId) return;
      if (!planDocIdsByJob.has(jobId)) planDocIdsByJob.set(jobId, []);
      planDocIdsByJob.get(jobId)!.push(planId);
    });

    const planByJob = new Map<string, PmsPlan>();
    plans.forEach((plan) => {
      const existing = planByJob.get(plan.jobId);
      if (!existing) {
        planByJob.set(plan.jobId, plan);
        return;
      }
      const existingTime = new Date(existing.plannedEnd || existing.plannedStart || 0).getTime();
      const nextTime = new Date(plan.plannedEnd || plan.plannedStart || 0).getTime();
      if (nextTime >= existingTime) {
        planByJob.set(plan.jobId, plan);
      }
    });

    const activeAssignments = jobs
      .map((job) => {
        const status = String(job.status || "").toUpperCase();
        if (status !== "IN_PROGRESS" && status !== "PLANNED") return null;
        const plan = planByJob.get(job.id);
        if (!plan?.plannedStart || !plan?.plannedEnd) return null;
        const startMs = new Date(plan.plannedStart).getTime();
        const endMs = new Date(plan.plannedEnd).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
        const order = ordersById.get(job.orderId);
        return {
          jobId: job.id,
          orderId: job.orderId,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
          status,
          machineId: plan.machineId,
          personId: plan.personId,
          plannedStart: plan.plannedStart,
          plannedEnd: plan.plannedEnd,
          startMs,
          endMs,
        };
      })
      .filter(Boolean) as Array<{
      jobId: string;
      orderId: string;
      orderNo: string;
      status: "IN_PROGRESS" | "PLANNED";
      machineId?: string;
      personId?: string;
      plannedStart: string;
      plannedEnd: string;
      startMs: number;
      endMs: number;
    }>;

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const groupKey =
        job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
      if (!jobsByGroup.has(groupKey)) jobsByGroup.set(groupKey, []);
      jobsByGroup.get(groupKey)!.push(job);
    });

    const rows = Array.from(jobsByGroup.entries())
      .map(([groupKey, groupJobs]) => {
        if (!groupJobs.length) return null;
        const sortedJobs = [...groupJobs].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
        const hasActive = sortedJobs.some((job) => job.status !== "DONE");
        if (!hasActive) return null;

        const currentJob =
          sortedJobs.find((job) => job.status === "IN_PROGRESS") ||
          sortedJobs.find((job) => job.status === "PLANNED") ||
          sortedJobs.find((job) => job.status === "WAITING") ||
          sortedJobs[0];

        if (!currentJob) return null;

        const order = ordersById.get(currentJob.orderId);
        if (isOrderClosedForPms(order)) return null;
        const product = currentJob.productId ? productById.get(currentJob.productId) : undefined;
        const routingSteps = currentJob.productId
          ? routingByProduct.get(currentJob.productId) || []
          : [];

        const stepPlanMap = new Map<
          number,
          {
            plannedStart?: string;
            plannedEnd?: string;
            actualStart?: string;
            actualEnd?: string;
            status?: string;
            machineName?: string;
            personName?: string;
          }
        >();
        sortedJobs.forEach((groupJob) => {
          if (groupJob.stepNo === undefined || groupJob.stepNo === null) return;
          const plan = planByJob.get(groupJob.id);
          const machineName = plan?.machineId
            ? machineById.get(plan.machineId)?.name || plan.machineId
            : undefined;
          const personName = plan?.personId
            ? peopleById.get(plan.personId)?.name || plan.personId
            : undefined;
          stepPlanMap.set(groupJob.stepNo, {
            plannedStart: groupJob.plannedStart ?? plan?.plannedStart,
            plannedEnd: groupJob.plannedEnd ?? plan?.plannedEnd,
            actualStart: groupJob.actualStart,
            actualEnd: groupJob.actualEnd,
            status: groupJob.status,
            machineName,
            personName,
          });
        });

        const currentStepNo = currentJob.stepNo ?? routingSteps[0]?.stepNo;
        const currentStep =
          routingSteps.find((step) => step.stepNo === currentStepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const maxStepNo = routingSteps.reduce((max, step) => {
          return Math.max(max, Number(step?.stepNo || 0));
        }, 0);
        const isFinalStep = Boolean(currentStepNo && maxStepNo && Number(currentStepNo) >= maxStepNo);

        const currentPlan = currentStep ? stepPlanMap.get(currentStep.stepNo) : undefined;
        const nextPlan = nextStep ? stepPlanMap.get(nextStep.stepNo) : undefined;

        const machine = currentPlan?.machineName;
        const person = currentPlan?.personName;
        const nextMachine = nextPlan?.machineName;
        const nextPerson = nextPlan?.personName;
        const currentPlanDoc = planByJob.get(currentJob.id);
        const currentMachineId = currentPlanDoc?.machineId;
        const currentPersonId = currentPlanDoc?.personId;

        const vasInfo = resolveVasInfo(order, product?.name);
        const resetJobs = sortedJobs.filter(
          (job) => job.status === "PLANNED" || job.status === "WAITING"
        );
        const resetJobIds = resetJobs.map((job) => job.id).filter(Boolean);
        const resetPlanDocIds = resetJobIds.flatMap(
          (jobId) => planDocIdsByJob.get(jobId) || []
        );
        let blockedByLabel: string | undefined;
        if (
          String(currentJob.status || "").toUpperCase() === "PLANNED" &&
          currentPlanDoc?.plannedStart &&
          (currentMachineId || currentPersonId)
        ) {
          const rowStartMs = new Date(currentPlanDoc.plannedStart).getTime();
          if (Number.isFinite(rowStartMs)) {
            const relatedAssignments = activeAssignments.filter((assignment) => {
              if (assignment.jobId === currentJob.id) return false;
              const sameMachine =
                Boolean(currentMachineId) && assignment.machineId === currentMachineId;
              const samePerson =
                Boolean(currentPersonId) && assignment.personId === currentPersonId;
              return sameMachine || samePerson;
            });
            const ongoingNow = relatedAssignments
              .filter(
                (assignment) =>
                  assignment.status === "IN_PROGRESS" &&
                  assignment.startMs <= nowMs &&
                  assignment.endMs >= nowMs &&
                  assignment.endMs <= rowStartMs
              )
              .sort((a, b) => b.endMs - a.endMs)[0];
            if (ongoingNow) {
              blockedByLabel = `Blocked by ${ongoingNow.orderNo} (${ongoingNow.status}) till ${formatDateTime(
                ongoingNow.plannedEnd
              )}`;
            }
          }
        }

        return {
          key: groupKey,
          currentJobId: currentJob.id,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || currentJob.orderId,
          orderId: currentJob.orderId,
          customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
          vasName: vasInfo.vasName,
          vasGroup: vasInfo.vasGroup,
          qty: vasInfo.qty,
          process: currentJob.process || currentStep?.process || "Not scheduled",
          machine,
          person,
          plannedStart: currentPlan?.plannedStart ?? currentJob.plannedStart,
          plannedEnd: currentPlan?.plannedEnd ?? currentJob.plannedEnd,
          status: currentJob.status || "WAITING",
          routingSteps,
          currentStepNo,
          isFinalStep,
          totalSteps: maxStepNo,
          productName: product?.name || currentJob.productId || "Unknown product",
          stepPlanMap,
          nextProcess: nextStep?.process,
          nextPlannedStart: nextPlan?.plannedStart,
          nextPlannedEnd: nextPlan?.plannedEnd,
          nextMachine,
          nextPerson,
          resetJobIds,
          resetPlanDocIds,
          blockedByLabel,
        };
      })
      .filter(Boolean) as Array<{
        key: string;
        currentJobId: string;
        orderId: string;
        orderNo: string;
        customer: string;
        vasName: string;
        vasGroup: string;
        qty: number;
        process: string;
        machine?: string;
        person?: string;
        plannedStart?: string;
        plannedEnd?: string;
        status: string;
        routingSteps: PmsRouting[];
        currentStepNo?: number;
        isFinalStep: boolean;
        totalSteps: number;
        productName: string;
        stepPlanMap: Map<
          number,
          {
            plannedStart?: string;
            plannedEnd?: string;
            actualStart?: string;
            actualEnd?: string;
            status?: string;
            machineName?: string;
            personName?: string;
          }
        >;
        nextProcess?: string;
        nextPlannedStart?: string;
        nextPlannedEnd?: string;
        nextMachine?: string;
        nextPerson?: string;
        resetJobIds: string[];
        resetPlanDocIds: string[];
        blockedByLabel?: string;
      }>;

    const statusRank: Record<string, number> = {
      IN_PROGRESS: 0,
      PLANNED: 1,
      WAITING: 2,
      DONE: 3,
    };

    return rows.sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.plannedStart
        ? new Date(a.plannedStart).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart
        ? new Date(b.plannedStart).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [plans, jobs, orders, people, machines, products, routing, resolveVasInfo, isOrderClosedForPms]);

  const workSheetStepRows = useMemo(() => {
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
      routingByProduct.get(step.productId)!.push(step);
    });
    routingByProduct.forEach((steps, key) => {
      routingByProduct.set(
        key,
        [...steps].sort((a, b) => a.stepNo - b.stepNo)
      );
    });

    const planByJob = new Map<string, PmsPlan>();
    plans.forEach((plan) => {
      const existing = planByJob.get(plan.jobId);
      if (!existing) {
        planByJob.set(plan.jobId, plan);
        return;
      }
      const existingTime = new Date(existing.plannedEnd || existing.plannedStart || 0).getTime();
      const nextTime = new Date(plan.plannedEnd || plan.plannedStart || 0).getTime();
      if (nextTime >= existingTime) {
        planByJob.set(plan.jobId, plan);
      }
    });

    const rows = jobs
      .filter((job) => job.status !== "DONE")
      .map((job) => {
        const order = ordersById.get(job.orderId);
        if (!isOrderInvoiced(order) || isOrderClosedForPms(order)) return null;
        const product = job.productId ? productById.get(job.productId) : undefined;
        const routingSteps = job.productId
          ? routingByProduct.get(job.productId) || []
          : [];
        const currentStep =
          routingSteps.find((step) => step.stepNo === job.stepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const plan = planByJob.get(job.id);
        const vasInfo = resolveVasInfo(order, product?.name);
        const processName = job.process || currentStep?.process || "Not scheduled";
        const processLabel = job.stepNo ? `${processName} (Step ${job.stepNo})` : processName;
        const nextLabel = nextStep?.process
          ? `${nextStep.process} (Step ${nextStep.stepNo})`
          : "-";

        return {
          key: job.id,
          stepNo: job.stepNo ?? currentStep?.stepNo,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
          customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
          vasName: vasInfo.vasName,
          qty: vasInfo.qty,
          productName: product?.name || job.productId || "Unknown product",
          status: job.status || "WAITING",
          nextProcess: nextLabel,
          machine: plan?.machineId ? machineById.get(plan.machineId)?.name : undefined,
          person: plan?.personId ? peopleById.get(plan.personId)?.name : undefined,
          process: processLabel,
          plannedStart: job.plannedStart || plan?.plannedStart,
          plannedEnd: job.plannedEnd || plan?.plannedEnd,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
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
      stepNo?: number;
    }>;

    const compareOrderNo = (left: string, right: string) => {
      const leftNum = Number(left);
      const rightNum = Number(right);
      const leftIsNum = Number.isFinite(leftNum);
      const rightIsNum = Number.isFinite(rightNum);
      if (leftIsNum && rightIsNum) return leftNum - rightNum;
      return String(left).localeCompare(String(right));
    };

    return rows.sort((a, b) => {
      const orderCompare = compareOrderNo(a.orderNo, b.orderNo);
      if (orderCompare !== 0) return orderCompare;
      const productCompare = a.productName.localeCompare(b.productName);
      if (productCompare !== 0) return productCompare;
      const vasCompare = a.vasName.localeCompare(b.vasName);
      if (vasCompare !== 0) return vasCompare;
      const stepA = a.stepNo ?? Number.MAX_SAFE_INTEGER;
      const stepB = b.stepNo ?? Number.MAX_SAFE_INTEGER;
      if (stepA !== stepB) return stepA - stepB;
      const aTime = a.plannedStart ? new Date(a.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart ? new Date(b.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [jobs, orders, people, machines, products, routing, plans, resolveVasInfo, isOrderInvoiced, isOrderClosedForPms]);

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
    ]);

    return [header, ...values];
  };

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

  const handleCreateJobsForRow = async (row: any) => {
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
    if (row.hasJobsForProduct) {
      toast({
        title: "Jobs already exist",
        description: "PMS jobs are already created for this VAS item.",
      });
      return;
    }

    const qty = Number(row.qty) || 1;
    setCreatingJobKey(row.key);
    try {
      const createRes = await fetch("/api/pms/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: row.orderId,
          productId: row.matchedProductId,
          qty,
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
        description: `Scheduled ${row.vasName} (Qty: ${qty}).`,
      });
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
      const jobGroupMap = new Map<string, { orderId: string; productId: string; qty: number }>();
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
        } else {
          jobGroupMap.set(key, { orderId: row.orderId, productId: row.matchedProductId, qty });
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

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.category) {
      toast({ variant: "destructive", title: "Product name and category are required." });
      return;
    }
    await addDoc(collection(db, "products"), {
      name: newProduct.name.trim(),
      category: newProduct.category.trim(),
      createdAt: new Date().toISOString(),
    });
    setNewProduct({ name: "", category: "" });
    toast({ title: "✓ Product added successfully" });
  };

  const handleDeleteProduct = async (id: string) => {
    const relatedRouting = routing.filter((r) => r.productId === id);
    if (relatedRouting.length > 0) {
      toast({
        variant: "destructive",
        title: "Cannot delete product",
        description: "Please remove all routing steps first.",
      });
      return;
    }
    await deleteDoc(doc(db, "products", id));
    if (selectedProductId === id) setSelectedProductId("");
    toast({ title: "✓ Product deleted" });
  };

  const handleAddRoutingRow = () => {
    const nextStep = routingRows.length ? Math.max(...routingRows.map((r) => r.stepNo)) + 1 : 1;
    setRoutingRows((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        productId: selectedProductId,
        stepNo: nextStep,
        process: "",
        cycleMinutes: 0,
        ops: 1,
      },
    ]);
  };

  const handleSaveRouting = async () => {
    if (!selectedProductId) return;
    const stepNos = routingRows.map((row) => row.stepNo);
    const uniqueSteps = new Set(stepNos);
    if (uniqueSteps.size !== stepNos.length) {
      toast({ variant: "destructive", title: "Step numbers must be unique." });
      return;
    }
    const sorted = [...routingRows].sort((a, b) => a.stepNo - b.stepNo);

    const isAscending = routingRows.every((row, idx) => row.stepNo === sorted[idx]?.stepNo);
    if (!isAscending) {
      toast({ variant: "destructive", title: "Step numbers must be in ascending order." });
      return;
    }

    const invalidRow = routingRows.find((row) => row.cycleMinutes <= 0 || row.ops <= 0 || !row.process);
    if (invalidRow) {
      toast({ variant: "destructive", title: "All fields are required and must be positive." });
      return;
    }

    setSavingRouting(true);
    const existing = routing.filter((row) => row.productId === selectedProductId);
    const keepIds = new Set(routingRows.map((row) => `${selectedProductId}_${row.stepNo}`));

    const updates = routingRows.map((row) => {
      const id = `${selectedProductId}_${row.stepNo}`;
      return setDoc(
        doc(db, "routing", id),
        {
          productId: selectedProductId,
          stepNo: row.stepNo,
          process: row.process.trim(),
          cycleMinutes: row.cycleMinutes,
          ops: row.ops,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    const deletions = existing
      .filter((row) => !keepIds.has(`${row.productId}_${row.stepNo}`))
      .map((row) => deleteDoc(doc(db, "routing", row.id)));

    await Promise.all([...updates, ...deletions]);
    setSavingRouting(false);
    toast({ title: "✓ Routing saved successfully" });
  };

  const handleAddMachine = async () => {
    if (!newMachine.name || !newMachine.process) {
      toast({ variant: "destructive", title: "Machine name and process are required." });
      return;
    }
    await addDoc(collection(db, "machines"), {
      name: newMachine.name.trim(),
      process: newMachine.process.trim(),
      shiftMinutes: toNumber(newMachine.shiftMinutes),
      active: true,
      createdAt: new Date().toISOString(),
    });
    setNewMachine({ name: "", process: "", shiftMinutes: "480" });
    toast({ title: "✓ Machine added successfully" });
  };

  const handleUpdateMachine = async (id: string, updates: Partial<PmsMachine>) => {
    await setDoc(doc(db, "machines", id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    setEditingMachine(null);
    toast({ title: "✓ Machine updated" });
  };

  const handleDeleteMachine = async (id: string) => {
    const relatedSkills = skills.filter((s) => s.machineId === id);
    if (relatedSkills.length > 0) {
      toast({
        variant: "destructive",
        title: "Cannot delete machine",
        description: "Please remove all skill assignments first.",
      });
      return;
    }
    await deleteDoc(doc(db, "machines", id));
    toast({ title: "✓ Machine deleted" });
  };

  const handleAddPerson = async () => {
    if (!newPerson.name) {
      toast({ variant: "destructive", title: "Person name is required." });
      return;
    }
    await addDoc(collection(db, "people"), {
      name: newPerson.name.trim(),
      role: newPerson.role.trim() || null,
      createdAt: new Date().toISOString(),
    });
    setNewPerson({ name: "", role: "" });
    toast({ title: "✓ Person added successfully" });
  };

  const handleUpdatePerson = async (id: string, updates: Partial<PmsPerson>) => {
    await setDoc(doc(db, "people", id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    setEditingPerson(null);
    toast({ title: "✓ Person updated" });
  };

  const handleDeletePerson = async (id: string) => {
    const relatedSkills = skills.filter((s) => s.personId === id);
    if (relatedSkills.length > 0) {
      toast({
        variant: "destructive",
        title: "Cannot delete person",
        description: "Please remove all skill assignments first.",
      });
      return;
    }
    await deleteDoc(doc(db, "people", id));
    toast({ title: "✓ Person deleted" });
  };

  const handleAddDowntime = async () => {
    if (!newDowntime.machineId || !newDowntime.from || !newDowntime.to) {
      toast({ variant: "destructive", title: "Machine, From, and To are required." });
      return;
    }
    if (new Date(newDowntime.from) >= new Date(newDowntime.to)) {
      toast({ variant: "destructive", title: "'To' must be after 'From'." });
      return;
    }
    const fromIso = new Date(newDowntime.from).toISOString();
    const toIso = new Date(newDowntime.to).toISOString();

    await addDoc(collection(db, "machineDowntime"), {
      machineId: newDowntime.machineId,
      from: fromIso,
      to: toIso,
      reason: newDowntime.reason?.trim() || null,
      createdAt: new Date().toISOString(),
    });

    setNewDowntime({ machineId: "", from: "", to: "", reason: "" });
    toast({ title: "✓ Downtime logged" });
  };

  const handleDeleteDowntime = async (id: string) => {
    await deleteDoc(doc(db, "machineDowntime", id));
    toast({ title: "✓ Downtime entry deleted" });
  };

  const updateSkill = async (machineId: string, personId: string, category: string, allowed: boolean) => {
    const id = buildSkillId(machineId, personId, category);
    const machine = machines.find((item) => item.id === machineId);
    if (!machine) return;

    await setDoc(
      doc(db, "machineSkills", id),
      {
        machineId,
        personId,
        process: machine.process,
        category,
        allowed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const getSkillAllowed = (machineId: string, personId: string, category: string) =>
    skills.find((skill) => skill.machineId === machineId && skill.personId === personId && skill.category === category)
      ?.allowed ?? false;

  const openImportDialog = (tab: "routing" | "machines" | "skills" | "downtime") => {
    setImportState({ open: true, tab, text: "", loading: false, preview: [] });
  };

  const handleImportPreview = () => {
    try {
      const parsed = JSON.parse(importState.text);
      const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed[importState.tab] || []);
      setImportState((prev) => ({ ...prev, preview: items.slice(0, 5) }));
      toast({ title: `Preview: ${items.length} items ready to import` });
    } catch (error) {
      toast({ variant: "destructive", title: "Invalid JSON", description: (error as Error).message });
    }
  };

  const parseImportPayload = (raw: string) => {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { items: parsed };
    }
    return parsed;
  };

  const ensureProducts = async (payload: any) => {
    const items = payload?.products || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      const id = item.id || item.productId;
      const name = item.name || item.productName;
      const category = item.category;
      if (!id || !name || !category) return Promise.resolve();
      return setDoc(
        doc(db, "products", id),
        { name, category, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    });
    await Promise.all(actions);
    return actions.length;
  };

  const ensureMachines = async (payload: any) => {
    const items = payload?.machines || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      const id = item.id || item.machineId;
      const name = item.name || item.machineName;
      const process = item.process;
      if (!id || !name || !process) return Promise.resolve();
      const shiftMinutes = Number(item.shiftMinutes ?? 480);
      const active = item.active !== false;
      return setDoc(
        doc(db, "machines", id),
        { name, process, shiftMinutes, active, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    });
    await Promise.all(actions);
    return actions.length;
  };

  const ensurePeople = async (payload: any) => {
    const items = payload?.people || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      const id = item.id || item.personId;
      const name = item.name || item.personName;
      if (!id || !name) return Promise.resolve();
      return setDoc(
        doc(db, "people", id),
        { name, role: item.role || null, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    });
    await Promise.all(actions);
    return actions.length;
  };

  const importRouting = async (payload: any) => {
    const items = payload?.routing || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      const id = item.id || `${item.productId}_${item.stepNo}`;
      if (!id || !item.productId || !item.stepNo || !item.process) return Promise.resolve();
      return setDoc(
        doc(db, "routing", id),
        {
          productId: item.productId,
          stepNo: Number(item.stepNo),
          process: item.process,
          cycleMinutes: Number(item.cycleMinutes ?? item.cycle ?? 0),
          ops: Number(item.ops ?? item.OPS ?? 1),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
    await Promise.all(actions);
    return actions.length;
  };

  const importSkills = async (payload: any) => {
    const items = payload?.skills || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      const id = item.id || buildSkillId(item.machineId, item.personId, item.category);
      if (!id || !item.machineId || !item.personId || !item.category) return Promise.resolve();
      return setDoc(
        doc(db, "machineSkills", id),
        {
          machineId: item.machineId,
          personId: item.personId,
          process: item.process || "",
          category: item.category,
          allowed: item.allowed !== false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
    await Promise.all(actions);
    return actions.length;
  };

  const importDowntime = async (payload: any) => {
    const items = payload?.downtimes || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    const actions = items.map((item: any) => {
      if (!item.machineId || !item.from || !item.to) return Promise.resolve();
      return addDoc(collection(db, "machineDowntime"), {
        machineId: item.machineId,
        from: item.from,
        to: item.to,
        reason: item.reason || null,
        createdAt: new Date().toISOString(),
      });
    });
    await Promise.all(actions);
    return actions.length;
  };

  const handleImport = async () => {
    setImportState((prev) => ({ ...prev, loading: true }));
    try {
      const payload = parseImportPayload(importState.text);
      if (importState.tab === "routing") {
        const countProducts = (await ensureProducts(payload)) || 0;
        const countRouting = await importRouting(payload);
        toast({ title: `✓ Imported ${countRouting} routing rows (${countProducts} products)` });
      }
      if (importState.tab === "machines") {
        const count = (await ensureMachines(payload)) || 0;
        toast({ title: `✓ Imported ${count} machines` });
      }
      if (importState.tab === "skills") {
        const countPeople = (await ensurePeople(payload)) || 0;
        const countMachines = (await ensureMachines(payload)) || 0;
        const count = await importSkills(payload);
        toast({ title: `✓ Imported ${count} skills (${countPeople} people, ${countMachines} machines)` });
      }
      if (importState.tab === "downtime") {
        const count = await importDowntime(payload);
        toast({ title: `✓ Imported ${count} downtime entries` });
      }
      setImportState({ open: false, tab: importState.tab, text: "", loading: false, preview: [] });
    } catch (error) {
      console.error("PMS import failed:", error);
      toast({ variant: "destructive", title: "Import failed", description: (error as Error).message });
      setImportState((prev) => ({ ...prev, loading: false }));
    }
  };

  const exportData = (data: any[], filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `✓ Exported ${filename}` });
  };

  // Add these state variables near the top
const [selectedSkillMachine, setSelectedSkillMachine] = useState<string>("");
const [selectedSkillPerson, setSelectedSkillPerson] = useState<string>("");
const [copyToMachine, setCopyToMachine] = useState<string>("");
const [skillSearch, setSkillSearch] = useState<string>("");
const [viewFilter, setViewFilter] = useState<string>("all");

// Helper functions
const getSelectedSkillCount = () => {
  if (!selectedSkillMachine || !selectedSkillPerson) return 0;
  return categories.filter(cat =>
    getSkillAllowed(selectedSkillMachine, selectedSkillPerson, cat)
  ).length;
};

const handleBulkUpdateCurrentSelection = async (allowed: boolean) => {
  if (!selectedSkillMachine || !selectedSkillPerson) return;
  
  const updates = categories.map(category =>
    updateSkill(selectedSkillMachine, selectedSkillPerson, category, allowed)
  );
  
  await Promise.all(updates);
  toast({
    title: `✓ ${allowed ? 'Enabled' : 'Disabled'} all ${categories.length} skills`,
  });
};

const handleCopySkills = async () => {
  if (!selectedSkillMachine || !selectedSkillPerson || !copyToMachine) return;
  
  const currentSkills = categories.filter(cat =>
    getSkillAllowed(selectedSkillMachine, selectedSkillPerson, cat)
  );
  
  const updates = currentSkills.map(category =>
    updateSkill(copyToMachine, selectedSkillPerson, category, true)
  );
  
  await Promise.all(updates);
  toast({
    title: `✓ Copied ${currentSkills.length} skills to ${machines.find(m => m.id === copyToMachine)?.name}`,
  });
  setCopyToMachine("");
};

const handleDeleteAllSkills = async (machineId: string, personId: string) => {
  const updates = categories.map(category =>
    updateSkill(machineId, personId, category, false)
  );
  
  await Promise.all(updates);
  toast({ title: "✓ All skills removed" });
};

const getUniqueAssignments = () => {
  const unique = new Set(
    skills
      .filter(s => s.allowed)
      .map(s => `${s.machineId}-${s.personId}`)
  );
  return unique.size;
};

const getGroupedSkills = () => {
  // Get unique machine-person pairs that have at least one skill
  const pairs = Array.from(
    new Set(
      skills
        .filter(s => s.allowed)
        .map(s => `${s.machineId}-${s.personId}`)
    )
  ).map(pair => {
    const [machineId, personId] = pair.split('-');
    return { machineId, personId };
  });

  // Filter based on search
  const filtered = pairs.filter(pair => {
    const machine = machines.find(m => m.id === pair.machineId);
    const person = people.find(p => p.id === pair.personId);
    
    const searchLower = skillSearch.toLowerCase();
    return (
      machine?.name.toLowerCase().includes(searchLower) ||
      machine?.process.toLowerCase().includes(searchLower) ||
      person?.name.toLowerCase().includes(searchLower) ||
      person?.role?.toLowerCase().includes(searchLower)
    );
  });
    // after `filtered` is computed
  const filteredFinal =
    viewFilter === "active"
      ? filtered.filter(({ machineId }) => machines.find(m => m.id === machineId)?.active !== false)
      : filtered;


  // Group based on view filter
  if (viewFilter === "machine") {
    const grouped = new Map<string, typeof pairs>();
    filtered.forEach(pair => {
      const key = pair.machineId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(pair);
    });

    return Array.from(grouped.entries()).map(([machineId, items]) => ({
      header: machines.find(m => m.id === machineId)?.name || 'Unknown',
      items,
    }));
  }

  if (viewFilter === "person") {
    const grouped = new Map<string, typeof pairs>();
    filtered.forEach(pair => {
      const key = pair.personId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(pair);
    });

    return Array.from(grouped.entries()).map(([personId, items]) => ({
      header: people.find(p => p.id === personId)?.name || 'Unknown',
      items,
    }));
  }

  return [{ header: null, items: filtered }];
};



  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-[1800px]">

        {/* ── COMMAND HEADER ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border-2 border-slate-800 bg-slate-900 text-white p-5 space-y-4">
          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight leading-none">PMS Control Center</h1>
                <p className="text-slate-400 text-xs mt-0.5">Production Management System — Admin Mode</p>
              </div>
            </div>

            {/* Autopilot actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                onClick={handleRunAutopilot}
                disabled={runningAutopilot || runningPriorityReplan || resettingAutopilot || Boolean(priorityUpdatingOrderId) || Boolean(deletingPlanKey)}
              >
                {runningAutopilot ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                Run Autopilot
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white border-0"
                onClick={handleRunPriorityReplan}
                disabled={runningAutopilot || runningPriorityReplan || resettingAutopilot || Boolean(priorityUpdatingOrderId) || Boolean(deletingPlanKey)}
              >
                {runningPriorityReplan ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Priority Replan
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setResetAutopilotDialogOpen(true)}
                disabled={runningAutopilot || runningPriorityReplan || resettingAutopilot || Boolean(priorityUpdatingOrderId) || Boolean(deletingPlanKey)}
              >
                {resettingAutopilot ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Reset & Rerun
              </Button>
            </div>
          </div>

          {/* Live production stats */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: "In Progress", value: liveStats.inProgress, color: "bg-emerald-500", textColor: "text-emerald-300", dot: true },
              { label: "Planned", value: liveStats.planned, color: "bg-blue-500", textColor: "text-blue-300", dot: false },
              { label: "Waiting", value: liveStats.waiting, color: "bg-amber-500", textColor: "text-amber-300", dot: false },
              { label: "Done", value: liveStats.done, color: "bg-slate-500", textColor: "text-slate-300", dot: false },
              { label: "Emergency", value: liveStats.emergency, color: "bg-red-500", textColor: "text-red-300", dot: true },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", s.color, s.dot && "animate-pulse")} />
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</span>
                </div>
                <div className={cn("text-2xl font-extrabold tabular-nums leading-none", s.textColor)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* System resource stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-white/10 pt-3">
            {[
              { label: "Products", value: stats.products, sub: `${categories.length} categories`, icon: <Package className="h-3.5 w-3.5" /> },
              { label: "Active Machines", value: `${stats.activeMachines}/${stats.totalMachines}`, sub: `${Math.round((stats.totalCapacity / 60))}h total capacity`, icon: <Settings2 className="h-3.5 w-3.5" /> },
              { label: "Workforce", value: stats.people, sub: `${skills.filter(s => s.allowed).length} skill links`, icon: <Users className="h-3.5 w-3.5" /> },
              { label: "Downtime Events", value: stats.downtimeEvents, sub: `${workingHours.startTime} – ${workingHours.endTime} IST`, icon: <Clock className="h-3.5 w-3.5" /> },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                <span className="text-slate-400">{s.icon}</span>
                <div>
                  <div className="text-lg font-bold tabular-nums leading-none">{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                  <div className="text-[9px] text-slate-600">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Working Hours collapsible */}
          <div className="border-t border-white/10 pt-2">
            <button
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
              onClick={() => setWorkingHoursExpanded((v) => !v)}
            >
              <Clock className="h-3.5 w-3.5" />
              Working Hours: {workingHours.startTime} – {workingHours.endTime} IST
              {workingHoursExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </button>
            {workingHoursExpanded && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="work-start" className="text-xs text-slate-400">Start</Label>
                  <Input id="work-start" type="time" value={workingHours.startTime}
                    className="h-8 bg-white/10 border-white/20 text-white w-32 text-sm"
                    onChange={(e) => setWorkingHours((prev) => ({ ...prev, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="work-end" className="text-xs text-slate-400">End</Label>
                  <Input id="work-end" type="time" value={workingHours.endTime}
                    className="h-8 bg-white/10 border-white/20 text-white w-32 text-sm"
                    onChange={(e) => setWorkingHours((prev) => ({ ...prev, endTime: e.target.value }))} />
                </div>
                <Button size="sm" onClick={handleSaveWorkingHours} disabled={savingWorkingHours}
                  className="bg-white/20 hover:bg-white/30 text-white border-0 h-8">
                  {savingWorkingHours ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Save
                </Button>
                <p className="text-[10px] text-slate-500 self-end pb-1">IST (UTC+05:30) · offset {workingHours.timezoneOffsetMinutes}m</p>
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="live" className="space-y-4">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex h-10 gap-0.5 p-1 rounded-xl bg-muted min-w-max">
              <TabsTrigger value="live" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <Activity className="h-3.5 w-3.5" />
                Live VAS
                {liveStats.inProgress > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                    {liveStats.inProgress}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="work-status" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <BarChart2 className="h-3.5 w-3.5" />
                Work Status
              </TabsTrigger>
              <TabsTrigger value="work" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <ListChecks className="h-3.5 w-3.5" />
                Work Detail
              </TabsTrigger>
              <TabsTrigger value="routing" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <Package className="h-3.5 w-3.5" />
                Routing
              </TabsTrigger>
              <TabsTrigger value="machines" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <Settings2 className="h-3.5 w-3.5" />
                Machines
              </TabsTrigger>
              <TabsTrigger value="people" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <UserCheck className="h-3.5 w-3.5" />
                People
              </TabsTrigger>
              <TabsTrigger value="skills" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <Users className="h-3.5 w-3.5" />
                Skills
              </TabsTrigger>
              <TabsTrigger value="downtime" className="rounded-lg gap-1.5 text-xs px-3 data-[state=active]:bg-background data-[state=active]:shadow">
                <Clock className="h-3.5 w-3.5" />
                Downtime
                {stats.downtimeEvents > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                    {stats.downtimeEvents}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* WORK STATUS TAB */}
          {/* WORK STATUS TAB */}
          <TabsContent value="work-status" className="space-y-4">
            <WorkStatusPanel workStatusData={workStatusData} formatDateTime={formatDateTime} />
          </TabsContent>

          {/* LIVE VAS TAB */}
          <TabsContent value="live" className="space-y-3">
            {/* Search + Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search order / customer / VAS..."
                  value={vasSearch}
                  onChange={(e) => setVasSearch(e.target.value)}
                />
              </div>

              {/* Status filter pills */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "ALL", label: "All", count: liveStats.totalItems, cls: "bg-slate-100 text-slate-700 hover:bg-slate-200 data-[active=true]:bg-slate-700 data-[active=true]:text-white" },
                  { key: "IN_PROGRESS", label: "In Progress", count: liveStats.inProgress, cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 data-[active=true]:bg-emerald-600 data-[active=true]:text-white" },
                  { key: "PLANNED", label: "Planned", count: liveStats.planned, cls: "bg-blue-50 text-blue-700 hover:bg-blue-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white" },
                  { key: "WAITING", label: "Waiting", count: liveStats.waiting, cls: "bg-amber-50 text-amber-700 hover:bg-amber-100 data-[active=true]:bg-amber-500 data-[active=true]:text-white" },
                  { key: "DONE", label: "Done", count: liveStats.done, cls: "bg-slate-50 text-slate-500 hover:bg-slate-100 data-[active=true]:bg-slate-500 data-[active=true]:text-white" },
                  { key: "EMERGENCY", label: "Emergency", count: liveStats.emergency, cls: "bg-red-50 text-red-700 hover:bg-red-100 data-[active=true]:bg-red-600 data-[active=true]:text-white" },
                ].map((f) => (
                  <button
                    key={f.key}
                    data-active={vasStatusFilter === f.key}
                    onClick={() => setVasStatusFilter(f.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus:outline-none",
                      "border-transparent",
                      f.cls
                    )}
                  >
                    {f.label}
                    <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none">
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-[11px] uppercase tracking-wide pl-4">Order</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Customer</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">VAS Item</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide text-center">Qty</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">PMS Product</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Priority</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Current Step</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Machine</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Person</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Planned Start</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">ETA</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Reason</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveVasRowsFiltered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={14} className="h-28 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Activity className="h-8 w-8 opacity-30" />
                              <p className="text-sm font-medium">No VAS items match this filter</p>
                              <button onClick={() => setVasStatusFilter("ALL")} className="text-xs text-blue-500 hover:underline">Show all</button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        liveVasRowsFiltered.map((row) => {
                          const statusBorderColor =
                            row.isEmergency ? "border-l-red-500" :
                            row.status === "IN_PROGRESS" ? "border-l-emerald-500" :
                            row.status === "PLANNED" ? "border-l-blue-500" :
                            row.status === "WAITING" ? "border-l-amber-400" :
                            row.status === "DONE" ? "border-l-slate-300" : "border-l-transparent";

                          return (
                            <TableRow key={row.key} className={cn(
                              "border-l-[3px] hover:bg-muted/30 transition-colors",
                              statusBorderColor,
                              row.isEmergency && "bg-red-50/40"
                            )}>
                              <TableCell className="font-bold text-sm pl-4 whitespace-nowrap">
                                {row.orderNo}
                                {row.isEmergency && (
                                  <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 animate-pulse">!!</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm max-w-[140px] truncate" title={row.customer}>{row.customer}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm leading-tight">{row.vasName}</div>
                                  {row.group && row.group !== "-" && (
                                    <div className="text-[10px] text-muted-foreground">{row.group}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center font-mono text-sm">{row.qty}</TableCell>
                              <TableCell>
                                {row.matchedProductName ? (
                                  <span className="text-sm font-medium">{row.matchedProductName}</span>
                                ) : (
                                  <span className="text-xs text-destructive font-medium">No match</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                                  row.status === "IN_PROGRESS" && "bg-emerald-100 text-emerald-700",
                                  row.status === "PLANNED" && "bg-blue-100 text-blue-700",
                                  row.status === "WAITING" && "bg-amber-100 text-amber-700",
                                  row.status === "DONE" && "bg-slate-100 text-slate-600"
                                )}>
                                  {row.status === "IN_PROGRESS" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                  {row.status.replace("_", " ")}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={row.isEmergency ? "destructive" : "secondary"}
                                  className={cn(
                                    "text-xs",
                                    row.isEmergency && "animate-pulse",
                                    !row.isEmergency && row.orderPriority <= 0 && "bg-orange-100 text-orange-700 hover:bg-orange-100",
                                    !row.isEmergency && row.orderPriority > 0 && row.priorityLabel === "Normal" && "bg-slate-100 text-slate-600 hover:bg-slate-100"
                                  )}
                                >
                                  {row.priorityLabel}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[160px]">
                                <span className="font-medium">{row.currentProcess}</span>
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.machineName !== "TBD" ? (
                                  <span className="font-medium">{row.machineName}</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">TBD</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.personName !== "TBD" ? (
                                  <span>{row.personName}</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">TBD</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                {formatDateTime(row.plannedStart)}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                {formatDateTime(row.eta)}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px]">
                                {row.noPlanReason ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className="text-amber-600 font-medium truncate block max-w-[110px]">{row.noPlanReason}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>{row.noPlanReason}</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right pr-4">
                                <div className="flex justify-end gap-1.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant={row.hasJobsForProduct ? "secondary" : "outline"}
                                        className="h-7 px-2 text-xs"
                                        disabled={
                                          creatingJobKey === row.key || row.hasJobsForProduct ||
                                          !row.matchedProductId || !row.invoiceReady ||
                                          resettingAutopilot || runningAutopilot ||
                                          runningPriorityReplan || Boolean(deletingPlanKey)
                                        }
                                        onClick={() => handleCreateJobsForRow(row)}
                                      >
                                        {creatingJobKey === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> :
                                         row.hasJobsForProduct ? <Check className="h-3 w-3" /> :
                                         <PlayCircle className="h-3 w-3" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {row.hasJobsForProduct ? "Jobs already created" : !row.invoiceReady ? "Invoice required" : !row.matchedProductId ? "No PMS product match" : "Create PMS Jobs"}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant={row.isEmergency ? "outline" : "ghost"}
                                        className={cn("h-7 px-2 text-xs", !row.isEmergency && "text-muted-foreground hover:text-destructive")}
                                        disabled={
                                          priorityUpdatingOrderId === row.orderId ||
                                          runningAutopilot || runningPriorityReplan ||
                                          resettingAutopilot || Boolean(deletingPlanKey)
                                        }
                                        onClick={() => handleSetOrderEmergencyPriority(row.orderId, !row.isEmergency)}
                                      >
                                        {priorityUpdatingOrderId === row.orderId ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : row.isEmergency ? (
                                          <X className="h-3 w-3" />
                                        ) : (
                                          <Zap className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {row.isEmergency ? "Clear Emergency" : "Mark as Emergency"}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                  <span>
                    Showing {liveVasRowsFiltered.length} of {liveStats.totalItems} items
                    {vasStatusFilter !== "ALL" && ` (filtered: ${vasStatusFilter})`}
                  </span>
                  {vasStatusFilter !== "ALL" && (
                    <button onClick={() => setVasStatusFilter("ALL")} className="text-blue-500 hover:underline">Clear filter</button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WORK DETAIL TAB */}
          <TabsContent value="work" className="space-y-3">
            {/* Summary strip */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[
                { label: "In Progress", val: workDetailRows.filter(r => r.status === "IN_PROGRESS").length, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                { label: "Planned", val: workDetailRows.filter(r => r.status === "PLANNED").length, cls: "bg-blue-100 text-blue-700 border-blue-200" },
                { label: "Waiting", val: workDetailRows.filter(r => r.status === "WAITING").length, cls: "bg-amber-100 text-amber-700 border-amber-200" },
                { label: "Total", val: workDetailRows.length, cls: "bg-slate-100 text-slate-700 border-slate-200" },
              ].map(s => (
                <span key={s.label} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold", s.cls)}>
                  {s.label}: <span className="tabular-nums font-extrabold">{s.val}</span>
                </span>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-[11px] uppercase tracking-wide pl-4 w-8"></TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Order</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Customer</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">VAS / Product</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide text-center w-14">Qty</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Progress</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Current Step</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Next Step</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Assigned To</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wide pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workDetailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="h-28 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <ListChecks className="h-8 w-8 opacity-30" />
                              <p className="text-sm font-medium">No planned work yet</p>
                              <p className="text-xs">Run autopilot to schedule jobs</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        workDetailRows.map((row) => {
                          const isExpanded = Boolean(expandedWorkRows[row.key]);
                          const canDeletePlan = (row.resetJobIds.length > 0 || row.resetPlanDocIds.length > 0) && row.status !== "IN_PROGRESS";
                          const canManualDone = row.isFinalStep && row.status === "IN_PROGRESS" && Boolean(row.currentJobId);
                          const doneSteps = row.routingSteps.filter(s => {
                            const sp = row.stepPlanMap.get(s.stepNo);
                            return String(sp?.status || (row.currentStepNo && s.stepNo < row.currentStepNo ? "DONE" : "")).toUpperCase() === "DONE";
                          }).length;
                          const totalSteps = row.routingSteps.length || row.totalSteps || 1;
                          const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

                          const borderCls =
                            row.status === "IN_PROGRESS" ? "border-l-emerald-500" :
                            row.status === "PLANNED" ? "border-l-blue-400" :
                            row.status === "WAITING" ? "border-l-amber-400" : "border-l-slate-200";

                          return (
                            <Fragment key={row.key}>
                              <TableRow className={cn(
                                "border-l-[3px] hover:bg-muted/20 transition-colors cursor-pointer",
                                borderCls,
                                isExpanded && "bg-muted/10"
                              )} onClick={() => toggleWorkRow(row.key)}>
                                {/* Expand toggle */}
                                <TableCell className="pl-4 w-8">
                                  <span className="text-muted-foreground">
                                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </span>
                                </TableCell>
                                <TableCell className="font-bold text-sm whitespace-nowrap">{row.orderNo}</TableCell>
                                <TableCell className="text-sm max-w-[130px] truncate" title={row.customer}>{row.customer}</TableCell>
                                <TableCell>
                                  <div>
                                    <div className="font-medium text-sm leading-tight">{row.vasName}</div>
                                    <div className="text-[10px] text-muted-foreground">{row.productName}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center font-mono text-sm">{row.qty}</TableCell>
                                {/* Progress */}
                                <TableCell className="min-w-[110px]">
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">{doneSteps}/{totalSteps} steps</span>
                                      <span className={cn("font-bold tabular-nums", progressPct === 100 ? "text-green-600" : row.status === "IN_PROGRESS" ? "text-emerald-600" : "text-slate-500")}>{progressPct}%</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={cn("h-full rounded-full transition-all duration-500",
                                          progressPct === 100 ? "bg-green-500" :
                                          row.status === "IN_PROGRESS" ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
                                          "bg-blue-400"
                                        )}
                                        style={{ width: `${Math.max(progressPct > 0 ? 6 : 0, progressPct)}%` }}
                                      />
                                    </div>
                                  </div>
                                </TableCell>
                                {/* Current step */}
                                <TableCell>
                                  <div>
                                    <div className="font-medium text-sm">{row.process}</div>
                                    <div className="text-[10px] text-muted-foreground tabular-nums">{formatDateTime(row.plannedStart)}</div>
                                    {row.status === "PLANNED" && (
                                      <div className="text-[10px] font-medium text-amber-600">{getQueueDelayLabel(row.plannedStart)}</div>
                                    )}
                                    {row.blockedByLabel && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <div className="text-[10px] font-medium text-red-500 flex items-center gap-0.5">
                                            <AlertCircle className="h-2.5 w-2.5" /> Blocked
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">{row.blockedByLabel}</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </TableCell>
                                {/* Next step */}
                                <TableCell>
                                  {row.nextProcess ? (
                                    <div>
                                      <div className="text-sm text-muted-foreground">{row.nextProcess}</div>
                                      <div className="text-[10px] text-muted-foreground tabular-nums">{formatDateTime(row.nextPlannedStart)}</div>
                                    </div>
                                  ) : (
                                    <span className={cn("text-xs", row.isFinalStep ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
                                      {row.isFinalStep ? "Final step" : "—"}
                                    </span>
                                  )}
                                </TableCell>
                                {/* Assigned */}
                                <TableCell>
                                  <div className="space-y-0.5">
                                    <div className="text-sm font-medium">{row.person || <span className="text-muted-foreground text-xs">TBD</span>}</div>
                                    <div className="text-[10px] text-muted-foreground">{row.machine || ""}</div>
                                  </div>
                                </TableCell>
                                {/* Status */}
                                <TableCell>
                                  <span className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                                    row.status === "IN_PROGRESS" && "bg-emerald-100 text-emerald-700",
                                    row.status === "PLANNED" && "bg-blue-100 text-blue-700",
                                    row.status === "WAITING" && "bg-amber-100 text-amber-700",
                                    row.status === "DONE" && "bg-green-100 text-green-700"
                                  )}>
                                    {row.status === "IN_PROGRESS" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                    {row.status.replace("_", " ")}
                                  </span>
                                </TableCell>
                                {/* Actions */}
                                <TableCell className="text-right pr-4" onClick={e => e.stopPropagation()}>
                                  <div className="flex justify-end items-center gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="default" className="h-7 px-2"
                                          disabled={!canManualDone || manualDoneSaving || deletingPlanKey === row.key || runningAutopilot || runningPriorityReplan || resettingAutopilot || Boolean(priorityUpdatingOrderId)}
                                          onClick={() => handleOpenManualDoneDialog(row)}>
                                          {manualDoneSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{canManualDone ? "Mark final step done" : row.isFinalStep ? "Not in progress" : "Not the final step"}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="destructive" className="h-7 px-2"
                                          disabled={!canDeletePlan || deletingPlanKey === row.key || runningAutopilot || runningPriorityReplan || resettingAutopilot || Boolean(priorityUpdatingOrderId)}
                                          onClick={() => handleDeletePlannedWork(row)}>
                                          {deletingPlanKey === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{canDeletePlan ? "Delete plan & reset to waiting" : row.status === "IN_PROGRESS" ? "Cannot delete in-progress plan" : "No removable plan"}</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TableCell>
                              </TableRow>

                              {/* Expanded routing roadmap */}
                              {isExpanded && (
                                <TableRow>
                                  <TableCell colSpan={11} className="bg-slate-50/60 border-l-[3px] border-l-slate-200 px-6 py-4">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Routing Roadmap</span>
                                        <span className="text-xs text-muted-foreground">— {row.productName}</span>
                                        <span className="ml-auto text-xs text-muted-foreground">{row.currentStepNo ? `Step ${row.currentStepNo} of ${totalSteps}` : `${totalSteps} steps`}</span>
                                      </div>
                                      {row.routingSteps.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-2">No routing steps configured for this product.</p>
                                      ) : (
                                        <div className="overflow-x-auto pb-1">
                                          <div className="flex items-start gap-0 min-w-max">
                                            {row.routingSteps.map((step, idx) => {
                                              const cur = row.currentStepNo ?? 0;
                                              const sp = row.stepPlanMap.get(step.stepNo);
                                              const rawSt = String(sp?.status || (cur && step.stepNo < cur ? "DONE" : "")).trim().toUpperCase();
                                              const isDone = rawSt === "DONE";
                                              const isIP = rawSt === "IN_PROGRESS";
                                              const isCur = Boolean(cur && step.stepNo === cur);
                                              const isPending = !isDone && !isIP && !isCur;

                                              const cardCls = isDone
                                                ? "bg-green-50 border-green-400 shadow-green-100"
                                                : isIP
                                                ? "bg-emerald-50 border-emerald-500 shadow-emerald-100 ring-2 ring-emerald-400/30"
                                                : isCur
                                                ? "bg-blue-50 border-blue-400 shadow-blue-100 ring-2 ring-blue-400/20"
                                                : "bg-white border-slate-200";
                                              const numCls = isDone
                                                ? "bg-green-500 text-white"
                                                : isIP
                                                ? "bg-emerald-500 text-white animate-pulse"
                                                : isCur
                                                ? "bg-blue-500 text-white"
                                                : "bg-slate-200 text-slate-500";
                                              const connCls = isDone ? "bg-green-400" : isIP || isCur ? "bg-blue-300" : "bg-slate-200";

                                              const displayStart = isDone ? (sp?.actualStart || sp?.plannedStart) : sp?.plannedStart;
                                              const displayEnd = isDone ? (sp?.actualEnd || sp?.plannedEnd) : sp?.plannedEnd;

                                              return (
                                                <div key={`${row.key}-${step.stepNo}`} className="flex items-center">
                                                  <div className={cn("relative rounded-xl border shadow-sm p-3 w-[130px] transition-all", cardCls)}>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                      <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0", numCls)}>
                                                        {isDone ? <Check className="h-3 w-3" /> : step.stepNo}
                                                      </span>
                                                      <span className="text-xs font-semibold truncate" title={step.process}>{step.process}</span>
                                                    </div>
                                                    <div className="space-y-0.5 text-[10px] text-slate-500 leading-snug">
                                                      {isDone && (
                                                        <div className="text-green-600 font-semibold">✓ Completed</div>
                                                      )}
                                                      {isIP && (
                                                        <div className="text-emerald-600 font-semibold flex items-center gap-1">
                                                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                          In Progress
                                                        </div>
                                                      )}
                                                      {isCur && !isIP && <div className="text-blue-600 font-semibold">Queued</div>}
                                                      {isPending && <div className="text-slate-400">Pending</div>}
                                                      {sp?.machineName && <div className="truncate" title={sp.machineName}>⚙ {sp.machineName}</div>}
                                                      {sp?.personName && <div className="truncate" title={sp.personName}>👤 {sp.personName}</div>}
                                                      {displayStart && <div className="tabular-nums">{formatDateTime(displayStart)}</div>}
                                                      {displayEnd && displayEnd !== displayStart && <div className="tabular-nums text-slate-400">→ {formatDateTime(displayEnd)}</div>}
                                                      <div className="text-slate-300 tabular-nums">{step.cycleMinutes}m / {step.ops} op{step.ops !== 1 ? "s" : ""}</div>
                                                    </div>
                                                  </div>
                                                  {idx < row.routingSteps.length - 1 && (
                                                    <div className={cn("h-[2px] w-6 flex-shrink-0 rounded-full mx-1", connCls)} />
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
                  <span>{workDetailRows.length} active job group{workDetailRows.length !== 1 ? "s" : ""} — click any row to expand the routing roadmap</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ROUTING TAB */}
          <TabsContent value="routing" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]">

              {/* ── Left: Product List ──────────────────────────────────── */}
              <div className="space-y-3">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Search products..." value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)} className="pl-8 h-8 text-sm" />
                    </div>

                    {/* Category summary */}
                    <div className="flex flex-wrap gap-1">
                      {categories.map((cat) => {
                        const count = products.filter(p => p.category === cat).length;
                        return (
                          <button key={cat}
                            onClick={() => setProductSearch(cat)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors">
                            {cat} <span className="font-bold">{count}</span>
                          </button>
                        );
                      })}
                      {productSearch && (
                        <button onClick={() => setProductSearch("")}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 hover:bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600 transition-colors">
                          <X className="h-2.5 w-2.5" /> Clear
                        </button>
                      )}
                    </div>

                    {/* Product list */}
                    <ScrollArea className="h-[320px] rounded-lg border">
                      <div className="p-2 space-y-1">
                        {filteredProducts.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-8">No products found</div>
                        )}
                        {filteredProducts.map((product) => {
                          const stepCount = routing.filter(r => r.productId === product.id).length;
                          const isSelected = selectedProductId === product.id;
                          return (
                            <div key={product.id}
                              onClick={() => setSelectedProductId(product.id)}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-all border",
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                  : "hover:bg-muted/60 border-transparent hover:border-border"
                              )}>
                              <div className="flex-1 min-w-0">
                                <div className={cn("font-medium text-sm truncate", isSelected ? "text-primary-foreground" : "")}>{product.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={cn("text-[10px] rounded px-1 py-0.5", isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{product.category}</span>
                                  {stepCount > 0 ? (
                                    <span className={cn("text-[10px] font-medium", isSelected ? "text-white/70" : "text-muted-foreground")}>{stepCount} step{stepCount !== 1 ? "s" : ""}</span>
                                  ) : (
                                    <span className={cn("text-[10px]", isSelected ? "text-white/60" : "text-amber-600")}>No steps</span>
                                  )}
                                </div>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className={cn("h-6 w-6 flex-shrink-0 ml-1", isSelected ? "hover:bg-white/20 text-white" : "hover:text-destructive")}
                                    onClick={(e) => { e.stopPropagation(); setDeleteDialog({ open: true, type: "product", id: product.id, name: product.name }); }}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete product</TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="text-[10px] text-muted-foreground text-center">{products.length} products · {categories.length} categories</div>
                  </CardContent>
                </Card>

                {/* Add Product form */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Add New Product</div>
                    <Input placeholder="Product name" value={newProduct.name} className="h-8 text-sm"
                      onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))} />
                    <Select value={newProduct.category} onValueChange={(v) => setNewProduct((prev) => ({ ...prev, category: v }))}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5">
                          <Input placeholder="Create new category…" className="h-7 text-xs"
                            onKeyDown={(e) => { if (e.key === "Enter") setNewProduct((prev) => ({ ...prev, category: e.currentTarget.value })); }} />
                        </div>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddProduct} className="w-full h-8 text-sm">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Add Product
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* ── Right: Routing Steps Editor ─────────────────────────── */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {selectedProductId ? (
                        <>
                          <CardTitle className="text-base flex items-center gap-2">
                            <span className="truncate">{products.find(p => p.id === selectedProductId)?.name}</span>
                            <Badge variant="secondary" className="text-xs flex-shrink-0">{products.find(p => p.id === selectedProductId)?.category}</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {routingRows.length} step{routingRows.length !== 1 ? "s" : ""} · Total cycle: {routingRows.reduce((s, r) => s + r.cycleMinutes, 0)}min
                          </CardDescription>
                        </>
                      ) : (
                        <CardTitle className="text-base text-muted-foreground">Select a product to configure routing</CardTitle>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 px-2"
                            onClick={() => exportData(routingRows, "routing.json")}
                            disabled={!selectedProductId || routingRows.length === 0}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export routing</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openImportDialog("routing")}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />Import
                      </Button>
                      <Button size="sm" className="h-8 px-2.5 text-xs" onClick={handleAddRoutingRow} disabled={!selectedProductId}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Add Step
                      </Button>
                    </div>
                  </div>

                  {/* Route chain preview */}
                  {routingRows.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 mt-2">
                      {routingRows.map((r, i) => (
                        <div key={r.id} className="flex items-center gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5">
                            <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">{r.stepNo}</span>
                            <span className="text-[10px] font-medium max-w-[80px] truncate">{r.process || "…"}</span>
                            <span className="text-[9px] text-muted-foreground">{r.cycleMinutes}m</span>
                          </div>
                          {i < routingRows.length - 1 && <span className="text-slate-300 text-[10px]">→</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="flex-1 space-y-3">
                  {selectedProductId ? (
                    <>
                      {/* Step editor table */}
                      <div className="rounded-xl border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="w-8 text-center text-[10px] uppercase tracking-wide"></TableHead>
                              <TableHead className="w-16 text-[10px] uppercase tracking-wide">Step</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide">Process Name</TableHead>
                              <TableHead className="w-28 text-[10px] uppercase tracking-wide">Cycle (min)</TableHead>
                              <TableHead className="w-20 text-[10px] uppercase tracking-wide">OPS</TableHead>
                              <TableHead className="w-20 text-[10px] uppercase tracking-wide">Time/Piece</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {routingRows.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={7} className="h-28 text-center">
                                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Package className="h-7 w-7 opacity-40" />
                                    <p className="text-sm">No steps yet — click Add Step</p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            {routingRows.map((row, index) => {
                              const timePerPiece = row.ops > 0 ? (row.cycleMinutes / row.ops).toFixed(1) : "—";
                              const maxCycle = Math.max(...routingRows.map(r => r.cycleMinutes), 1);
                              const barPct = Math.round((row.cycleMinutes / maxCycle) * 100);

                              return (
                                <TableRow key={row.id} className="group hover:bg-muted/10">
                                  <TableCell className="text-center">
                                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-move mx-auto" />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold mx-auto">
                                      {row.stepNo}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input value={row.process} placeholder="e.g., Assembly" className="h-7 text-sm border-0 bg-transparent hover:bg-muted/40 focus:bg-background focus:border px-2"
                                      onChange={(e) => { const process = e.target.value; setRoutingRows(prev => { const next = [...prev]; next[index] = { ...next[index], process }; return next; }); }} />
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-1">
                                      <Input type="number" min={0} step={0.1} value={row.cycleMinutes} className="h-7 text-sm w-full"
                                        onChange={(e) => { const cycleMinutes = toNumber(e.target.value); setRoutingRows(prev => { const next = [...prev]; next[index] = { ...next[index], cycleMinutes }; return next; }); }} />
                                      <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-primary/40 rounded-full" style={{ width: `${barPct}%` }} />
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input type="number" min={1} value={row.ops} className="h-7 text-sm w-full"
                                      onChange={(e) => { const ops = toNumber(e.target.value); setRoutingRows(prev => { const next = [...prev]; next[index] = { ...next[index], ops }; return next; }); }} />
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-muted-foreground tabular-nums">{timePerPiece}m</span>
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                                      onClick={() => setRoutingRows(prev => prev.filter((_, i) => i !== index))}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Total cycle time: <span className="font-semibold">{routingRows.reduce((s, r) => s + r.cycleMinutes, 0)} min</span>
                          {" · "}
                          Total OPS: <span className="font-semibold">{routingRows.reduce((s, r) => s + r.ops, 0)}</span>
                        </div>
                        <Button onClick={handleSaveRouting} disabled={savingRouting || routingRows.length === 0} className="h-8 px-4 text-sm">
                          {savingRouting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                          Save Routing
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Package className="h-12 w-12 opacity-30 mb-3" />
                      <p className="font-medium">No Product Selected</p>
                      <p className="text-sm">Pick a product from the left panel</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* MACHINES TAB */}
          <TabsContent value="machines" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              {/* Add Machine Form */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Add Machine
                    </CardTitle>
                    <CardDescription>Configure a new production machine</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="machine-name">Machine Name</Label>
                      <Input id="machine-name" placeholder="e.g., CNC-001" value={newMachine.name}
                        onChange={(e) => setNewMachine((prev) => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="machine-process">Process</Label>
                      <Input id="machine-process" placeholder="e.g., Cutting" value={newMachine.process}
                        onChange={(e) => setNewMachine((prev) => ({ ...prev, process: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shift-minutes">Shift Duration (minutes)</Label>
                      <Input id="shift-minutes" type="number" min={60} placeholder="480" value={newMachine.shiftMinutes}
                        onChange={(e) => setNewMachine((prev) => ({ ...prev, shiftMinutes: e.target.value }))} />
                      <p className="text-xs text-muted-foreground">Default: 480 min (8 hours)</p>
                    </div>
                    <Button onClick={handleAddMachine} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />Add Machine
                    </Button>
                  </CardContent>
                </Card>

                {/* Machine summary */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fleet Overview</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center">
                        <div className="text-2xl font-extrabold text-emerald-700">{stats.activeMachines}</div>
                        <div className="text-[10px] text-emerald-500">Active</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                        <div className="text-2xl font-extrabold text-slate-600">{stats.totalMachines - stats.activeMachines}</div>
                        <div className="text-[10px] text-slate-400">Inactive</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total Capacity</span>
                        <span className="font-semibold">{stats.totalCapacity} min ({Math.round(stats.totalCapacity / 60)}h)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                          style={{ width: `${stats.totalMachines > 0 ? Math.round((stats.activeMachines / stats.totalMachines) * 100) : 0}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground text-right">
                        {stats.totalMachines > 0 ? Math.round((stats.activeMachines / stats.totalMachines) * 100) : 0}% active
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Machines List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Machine Registry</CardTitle>
                      <CardDescription>Manage production machines and capacity</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => exportData(machines, "machines.json")}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export machines</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" onClick={() => openImportDialog("machines")}>
                        <Upload className="mr-2 h-4 w-4" />Import
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => setShowInactiveMachines(!showInactiveMachines)}>
                            {showInactiveMachines ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{showInactiveMachines ? "Hide inactive" : "Show inactive"}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search machines..." value={machineSearch}
                      onChange={(e) => setMachineSearch(e.target.value)} className="pl-9" />
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-[11px] uppercase tracking-wide">Machine</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Process</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Capacity</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Skills</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
                          <TableHead className="text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMachines.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Settings2 className="h-8 w-8 opacity-50" />
                                <p className="text-sm">No machines found</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredMachines.map((machine) => {
                          const maxCapacity = Math.max(...machines.map(m => m.shiftMinutes), 1);
                          const capacityPct = Math.round((machine.shiftMinutes / maxCapacity) * 100);
                          const machineSkillCount = skills.filter(s => s.machineId === machine.id && s.allowed).length;
                          const uniquePeople = new Set(skills.filter(s => s.machineId === machine.id && s.allowed).map(s => s.personId)).size;

                          return (
                            <TableRow key={machine.id} className={cn(
                              "group hover:bg-muted/20 transition-colors",
                              !machine.active && "opacity-60"
                            )}>
                              <TableCell>
                                {editingMachine === machine.id ? (
                                  <Input defaultValue={machine.name} autoFocus
                                    onBlur={(e) => {
                                      if (e.target.value !== machine.name) handleUpdateMachine(machine.id, { name: e.target.value });
                                      else setEditingMachine(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "h-2 w-2 rounded-full flex-shrink-0",
                                      machine.active ? "bg-emerald-500" : "bg-slate-300"
                                    )} />
                                    <span className="font-medium text-sm">{machine.name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                      onClick={() => setEditingMachine(machine.id)}>
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{machine.process}</Badge>
                              </TableCell>
                              <TableCell className="min-w-[140px]">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{machine.shiftMinutes} min</span>
                                    <span className="text-muted-foreground">{Math.round(machine.shiftMinutes / 60)}h</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full transition-all", machine.active ? "bg-emerald-400" : "bg-slate-300")}
                                      style={{ width: `${capacityPct}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-xs">
                                  <span className="font-medium">{machineSkillCount}</span>
                                  <span className="text-muted-foreground ml-1">skills · {uniquePeople} people</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() => handleUpdateMachine(machine.id, { active: !machine.active })}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors border",
                                    machine.active
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                  )}
                                >
                                  {machine.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                  {machine.active ? "Active" : "Inactive"}
                                </button>
                              </TableCell>
                              <TableCell className="text-right">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"
                                      onClick={() => setDeleteDialog({ open: true, type: "machine", id: machine.id, name: machine.name })}>
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete machine</TooltipContent>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Showing {filteredMachines.length} of {machines.length} machines</span>
                    <span>Total active capacity: {stats.totalCapacity} min/shift</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SKILLS TAB */}
            <TabsContent value="skills" className="space-y-4">
              {/* Stats strip */}
              <div className="grid grid-cols-4 gap-3">
                <Card className="border-l-4 border-l-violet-500">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-violet-100 rounded-lg"><UserCheck className="h-4 w-4 text-violet-600" /></div>
                    <div><div className="text-xl font-bold">{skills.filter(s => s.allowed).length}</div><div className="text-xs text-muted-foreground">Total Skills</div></div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg"><Settings2 className="h-4 w-4 text-blue-600" /></div>
                    <div><div className="text-xl font-bold">{getUniqueAssignments()}</div><div className="text-xs text-muted-foreground">Assignments</div></div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg"><Package className="h-4 w-4 text-emerald-600" /></div>
                    <div><div className="text-xl font-bold">{categories.length}</div><div className="text-xs text-muted-foreground">Categories</div></div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg"><Users className="h-4 w-4 text-orange-600" /></div>
                    <div><div className="text-xl font-bold">{people.length}</div><div className="text-xs text-muted-foreground">People</div></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
                {/* Left: Assignment panel */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" />Assign Skills</CardTitle>
                      <CardDescription className="text-xs">Select machine + person, then toggle categories</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Machine</Label>
                          <Select value={selectedSkillMachine} onValueChange={setSelectedSkillMachine}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {machines.filter(m => m.active).map((machine) => (
                                <SelectItem key={machine.id} value={machine.id}>
                                  <span className="text-sm">{machine.name}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">{machine.process}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Person</Label>
                          <Select value={selectedSkillPerson} onValueChange={setSelectedSkillPerson}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {people.map((person) => (
                                <SelectItem key={person.id} value={person.id}>
                                  <span className="text-sm">{person.name}</span>
                                  {person.role && <span className="ml-2 text-xs text-muted-foreground">{person.role}</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {selectedSkillMachine && selectedSkillPerson ? (
                        <>
                          {/* Context banner */}
                          <div className="flex items-center justify-between p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-semibold">{machines.find(m => m.id === selectedSkillMachine)?.name}</span>
                              <span className="text-muted-foreground">×</span>
                              <span className="font-semibold">{people.find(p => p.id === selectedSkillPerson)?.name}</span>
                            </div>
                            <Badge variant="secondary" className="text-xs">{getSelectedSkillCount()}/{categories.length}</Badge>
                          </div>

                          {/* Category grid */}
                          {categories.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                              No categories — add products first.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                              {categories.map((category) => {
                                const isAllowed = getSkillAllowed(selectedSkillMachine, selectedSkillPerson, category);
                                return (
                                  <button
                                    key={category}
                                    onClick={() => updateSkill(selectedSkillMachine, selectedSkillPerson, category, !isAllowed)}
                                    className={cn(
                                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-left text-sm transition-all",
                                      isAllowed
                                        ? "bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-300"
                                        : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    <div className={cn(
                                      "h-4 w-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all",
                                      isAllowed ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/40"
                                    )}>
                                      {isAllowed && <Check className="h-2.5 w-2.5 text-white" />}
                                    </div>
                                    <span className="truncate font-medium text-xs">{category}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Bulk actions */}
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => handleBulkUpdateCurrentSelection(true)}>
                              <Check className="mr-1.5 h-3 w-3" />Enable All
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => handleBulkUpdateCurrentSelection(false)}>
                              <X className="mr-1.5 h-3 w-3" />Disable All
                            </Button>
                          </div>

                          {/* Copy to another machine */}
                          <div className="flex gap-2">
                            <Select value={copyToMachine} onValueChange={setCopyToMachine}>
                              <SelectTrigger className="flex-1 h-8 text-xs">
                                <SelectValue placeholder="Copy skills to machine..." />
                              </SelectTrigger>
                              <SelectContent>
                                {machines.filter(m => m.active && m.id !== selectedSkillMachine).map((m) => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleCopySkills} disabled={!copyToMachine}>
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy to machine</TooltipContent>
                            </Tooltip>
                          </div>

                          <Button variant="ghost" size="sm" className="w-full h-7 text-xs"
                            onClick={() => { setSelectedSkillMachine(""); setSelectedSkillPerson(""); setCopyToMachine(""); }}>
                            <Plus className="mr-1.5 h-3 w-3" />Assign Another Pair
                          </Button>
                        </>
                      ) : (
                        <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                          <UserCheck className="h-10 w-10 opacity-30" />
                          <p className="text-sm">Select machine and person above</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Quick Add shortcuts */}
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Add</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              <Plus className="mr-1.5 h-3 w-3" />Person
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Add Person</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                              <Input placeholder="Full name" value={newPerson.name} onChange={(e) => setNewPerson((prev) => ({ ...prev, name: e.target.value }))} />
                              <Input placeholder="Role (optional)" value={newPerson.role} onChange={(e) => setNewPerson((prev) => ({ ...prev, role: e.target.value }))} />
                            </div>
                            <DialogFooter><Button onClick={handleAddPerson}>Add Person</Button></DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              <Plus className="mr-1.5 h-3 w-3" />Machine
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Add Machine</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                              <Input placeholder="Machine name" value={newMachine.name} onChange={(e) => setNewMachine((prev) => ({ ...prev, name: e.target.value }))} />
                              <Input placeholder="Process" value={newMachine.process} onChange={(e) => setNewMachine((prev) => ({ ...prev, process: e.target.value }))} />
                            </div>
                            <DialogFooter><Button onClick={handleAddMachine}>Add Machine</Button></DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right: Skills matrix */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Skills Matrix</CardTitle>
                        <CardDescription className="text-xs">All machine-person-category assignments</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Search..." value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} className="pl-8 h-8 text-xs w-44" />
                        </div>
                        <Select value={viewFilter} onValueChange={setViewFilter}>
                          <SelectTrigger className="h-8 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="active">Active Only</SelectItem>
                            <SelectItem value="machine">By Machine</SelectItem>
                            <SelectItem value="person">By Person</SelectItem>
                          </SelectContent>
                        </Select>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => exportData(skills, "skills.json")}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export</TooltipContent>
                        </Tooltip>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openImportDialog("skills")}>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />Import
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[580px]">
                      {getGroupedSkills().length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                          <Package className="h-10 w-10 opacity-30 mb-2" />
                          <p className="text-sm">No skills configured yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {getGroupedSkills().map((group, groupIndex) => (
                            <div key={groupIndex}>
                              {group.header && (
                                <div className="flex items-center gap-2 py-1.5 mb-1">
                                  <div className="h-px bg-border flex-1" />
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">{group.header}</span>
                                  <div className="h-px bg-border flex-1" />
                                </div>
                              )}
                              <div className="space-y-1.5">
                                {group.items.map((item) => {
                                  const machine = machines.find(m => m.id === item.machineId);
                                  const person = people.find(p => p.id === item.personId);
                                  const skillsForPair = skills.filter(s => s.machineId === item.machineId && s.personId === item.personId && s.allowed);
                                  const isSelected = selectedSkillMachine === item.machineId && selectedSkillPerson === item.personId;
                                  const coverage = categories.length > 0 ? (skillsForPair.length / categories.length) * 100 : 0;

                                  return (
                                    <div
                                      key={`${item.machineId}-${item.personId}`}
                                      onClick={() => { setSelectedSkillMachine(item.machineId); setSelectedSkillPerson(item.personId); }}
                                      className={cn(
                                        "group p-3 rounded-lg border-2 cursor-pointer transition-all",
                                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                                      )}
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0 space-y-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                              <div className="h-6 w-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                <Settings2 className="h-3 w-3 text-blue-600" />
                                              </div>
                                              <span className="font-semibold text-sm">{machine?.name || "?"}</span>
                                              <Badge variant="outline" className="text-xs h-5 px-1.5">{machine?.process}</Badge>
                                            </div>
                                            <span className="text-muted-foreground text-xs">+</span>
                                            <div className="flex items-center gap-1.5">
                                              <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-violet-700">
                                                {(person?.name || "?")[0].toUpperCase()}
                                              </div>
                                              <span className="font-semibold text-sm">{person?.name || "?"}</span>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {skillsForPair.length > 0 ? skillsForPair.map((skill) => (
                                              <span key={skill.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                {skill.category}
                                              </span>
                                            )) : (
                                              <span className="text-xs text-muted-foreground italic">No skills assigned</span>
                                            )}
                                          </div>
                                          {categories.length > 0 && (
                                            <div className="flex items-center gap-2">
                                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${coverage}%` }} />
                                              </div>
                                              <span className="text-xs text-muted-foreground">{skillsForPair.length}/{categories.length}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteAllSkills(item.machineId, item.personId); }}>
                                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Remove all skills</TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>



          {/* PEOPLE TAB */}
          <TabsContent value="people" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              {/* Add Person Form */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4" />
                      Add Person
                    </CardTitle>
                    <CardDescription>Register a new operator or team member</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Full Name</Label>
                      <Input
                        placeholder="e.g., Ravi Kumar"
                        value={newPerson.name}
                        onChange={(e) => setNewPerson((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input
                        placeholder="e.g., Senior Operator"
                        value={newPerson.role}
                        onChange={(e) => setNewPerson((prev) => ({ ...prev, role: e.target.value }))}
                      />
                    </div>
                    <Button onClick={handleAddPerson} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Person
                    </Button>
                  </CardContent>
                </Card>

                {/* People stats */}
                <Card>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-3 text-center">
                        <div className="text-3xl font-extrabold text-blue-700">{people.length}</div>
                        <div className="text-xs text-blue-500 mt-0.5">Total People</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-center">
                        <div className="text-3xl font-extrabold text-emerald-700">
                          {new Set(skills.filter(s => s.allowed).map(s => s.personId)).size}
                        </div>
                        <div className="text-xs text-emerald-500 mt-0.5">With Skills</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground text-center">
                      {skills.filter(s => s.allowed).length} total skill assignments
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* People List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>People Registry</CardTitle>
                      <CardDescription>Manage operators, team members, and their skills</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => exportData(people, "people.json")}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export people</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or role..."
                      value={personSearch}
                      onChange={(e) => setPersonSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-[11px] uppercase tracking-wide">Name</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Role</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Skill Links</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wide">Categories</TableHead>
                          <TableHead className="text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPeople.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Users className="h-8 w-8 opacity-50" />
                                <p className="text-sm">No people found</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredPeople.map((person) => {
                            const personSkills = skills.filter(s => s.personId === person.id && s.allowed);
                            const uniqueCategories = Array.from(new Set(personSkills.map(s => s.category)));
                            const uniqueMachines = Array.from(new Set(personSkills.map(s => s.machineId)));

                            return (
                              <TableRow key={person.id} className="group hover:bg-muted/20 transition-colors">
                                <TableCell>
                                  {editingPerson === person.id ? (
                                    <Input
                                      defaultValue={person.name}
                                      autoFocus
                                      onBlur={(e) => {
                                        if (e.target.value !== person.name) {
                                          handleUpdatePerson(person.id, { name: e.target.value });
                                        } else {
                                          setEditingPerson(null);
                                        }
                                      }}
                                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                                        {person.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="font-medium text-sm">{person.name}</span>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        onClick={() => setEditingPerson(person.id)}>
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {person.role ? (
                                    <Badge variant="outline" className="text-xs">{person.role}</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold tabular-nums">{personSkills.length}</span>
                                    <span className="text-xs text-muted-foreground">on {uniqueMachines.length} machine{uniqueMachines.length !== 1 ? "s" : ""}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {uniqueCategories.slice(0, 3).map((cat) => (
                                      <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 py-0">{cat}</Badge>
                                    ))}
                                    {uniqueCategories.length > 3 && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{uniqueCategories.length - 3}</Badge>
                                    )}
                                    {uniqueCategories.length === 0 && (
                                      <span className="text-xs text-muted-foreground">No skills</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7"
                                          onClick={() => {
                                            setSelectedSkillPerson(person.id);
                                          }}>
                                          <Settings2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Manage skills (go to Skills tab)</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost" size="icon" className="h-7 w-7"
                                          onClick={() => setDeleteDialog({ open: true, type: "person", id: person.id, name: person.name })}
                                        >
                                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Delete person</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {filteredPeople.length} of {people.length} people
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* DOWNTIME TAB */}
          <TabsContent value="downtime" className="space-y-4">
            {/* Stats strip */}
            <div className="grid grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg"><Clock className="h-4 w-4 text-red-600" /></div>
                  <div><div className="text-xl font-bold">{downtimes.length}</div><div className="text-xs text-muted-foreground">Events</div></div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg"><AlertCircle className="h-4 w-4 text-orange-600" /></div>
                  <div>
                    <div className="text-xl font-bold">
                      {(() => {
                        const totalMins = downtimes.reduce((sum, d) => {
                          const diff = new Date(d.to).getTime() - new Date(d.from).getTime();
                          return sum + (diff > 0 ? Math.round(diff / 60000) : 0);
                        }, 0);
                        const h = Math.floor(totalMins / 60);
                        return h > 0 ? `${h}h` : `${totalMins}m`;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Downtime</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-slate-500">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Settings2 className="h-4 w-4 text-slate-600" /></div>
                  <div><div className="text-xl font-bold">{new Set(downtimes.map(d => d.machineId)).size}</div><div className="text-xs text-muted-foreground">Machines Affected</div></div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg"><Activity className="h-4 w-4 text-emerald-600" /></div>
                  <div><div className="text-xl font-bold">{machines.filter(m => m.active && !downtimes.some(d => d.machineId === m.id)).length}</div><div className="text-xs text-muted-foreground">Fully Available</div></div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              {/* Left: Log form */}
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    Log Downtime
                  </CardTitle>
                  <CardDescription className="text-xs">Record machine unavailability periods</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Machine</Label>
                    <Select value={newDowntime.machineId} onValueChange={(v) => setNewDowntime((p) => ({ ...p, machineId: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select machine..." />
                      </SelectTrigger>
                      <SelectContent>
                        {machines.filter(m => m.active).map((machine) => (
                          <SelectItem key={machine.id} value={machine.id}>
                            <span>{machine.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{machine.process}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</Label>
                      <Input type="datetime-local" className="h-9 text-xs" value={newDowntime.from} onChange={(e) => setNewDowntime((p) => ({ ...p, from: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</Label>
                      <Input type="datetime-local" className="h-9 text-xs" value={newDowntime.to} onChange={(e) => setNewDowntime((p) => ({ ...p, to: e.target.value }))} />
                    </div>
                  </div>

                  {/* Duration presets */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Duration</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {([["30m", 30], ["1h", 60], ["2h", 120], ["4h", 240], ["8h", 480]] as [string, number][]).map(([label, mins]) => (
                        <button
                          key={label}
                          onClick={() => {
                            if (!newDowntime.from) return;
                            const fromDate = new Date(newDowntime.from);
                            if (isNaN(fromDate.getTime())) return;
                            const toDate = new Date(fromDate.getTime() + mins * 60000);
                            const pad = (n: number) => String(n).padStart(2, "0");
                            const toLocal = `${toDate.getFullYear()}-${pad(toDate.getMonth()+1)}-${pad(toDate.getDate())}T${pad(toDate.getHours())}:${pad(toDate.getMinutes())}`;
                            setNewDowntime((p) => ({ ...p, to: toLocal }));
                          }}
                          className="px-2.5 py-1 text-xs rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-all"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason</Label>
                    <Textarea
                      placeholder="e.g., Scheduled maintenance, breakdown..."
                      value={newDowntime.reason}
                      onChange={(e) => setNewDowntime((p) => ({ ...p, reason: e.target.value }))}
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>

                  <Button onClick={handleAddDowntime} className="w-full h-9">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Downtime
                  </Button>
                </CardContent>
              </Card>

              {/* Right: History */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Downtime History</CardTitle>
                      <CardDescription className="text-xs">Machine unavailability log, newest first</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => exportData(downtimes, "downtime.json")}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openImportDialog("downtime")}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />Import
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {downtimes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-lg">
                      <Clock className="h-10 w-10 opacity-30 mb-2" />
                      <p className="text-sm font-medium">No downtime recorded</p>
                      <p className="text-xs">All machines are fully available</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[520px]">
                      <div className="space-y-2">
                        {downtimes
                          .slice()
                          .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime())
                          .map((entry) => {
                            const machine = machines.find(m => m.id === entry.machineId);
                            const fromDate = new Date(entry.from);
                            const toDate = new Date(entry.to);
                            const durationMins = Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 60000));
                            const durH = Math.floor(durationMins / 60);
                            const durM = durationMins % 60;
                            const now = new Date();
                            const isActive = fromDate <= now && toDate >= now;

                            return (
                              <div key={entry.id} className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border-2 transition-all",
                                isActive ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : "border-border"
                              )}>
                                <div className={cn(
                                  "mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0",
                                  isActive ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"
                                )} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm">{machine?.name || "Unknown Machine"}</span>
                                    {machine && <Badge variant="outline" className="text-xs h-5 px-1.5">{machine.process}</Badge>}
                                    {isActive && <Badge className="bg-red-500 text-white text-xs h-5 px-1.5">Active</Badge>}
                                    <Badge variant="secondary" className="text-xs h-5">
                                      {durH > 0 ? `${durH}h ` : ""}{durM}m
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>{formatDateInZone(fromDate, { timeZone: IST_TIME_ZONE })} {formatTimeInZone(fromDate, { timeZone: IST_TIME_ZONE })}</span>
                                    <span>→</span>
                                    <span>{formatDateInZone(toDate, { timeZone: IST_TIME_ZONE })} {formatTimeInZone(toDate, { timeZone: IST_TIME_ZONE })}</span>
                                  </div>
                                  {entry.reason && (
                                    <p className="mt-1 text-xs text-muted-foreground truncate max-w-sm">{entry.reason}</p>
                                  )}
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                                      onClick={() => setDeleteDialog({ open: true, type: "downtime", id: entry.id, name: `${machine?.name || "Machine"} downtime` })}>
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          })}
                      </div>
                    </ScrollArea>
                  )}
                  {downtimes.length > 0 && (
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                      <span>{downtimes.length} event{downtimes.length !== 1 ? "s" : ""}</span>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportData(downtimes, "downtime.json")}>
                        <Download className="mr-1.5 h-3 w-3" />Export all
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Import Dialog */}
        <Dialog open={importState.open} onOpenChange={(open) => setImportState((prev) => ({ ...prev, open }))}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Import {importState.tab.charAt(0).toUpperCase() + importState.tab.slice(1)} Data
              </DialogTitle>
              <DialogDescription>
                Paste JSON data to import. This will create or update records in Firestore.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="import-json">JSON Data</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImportPreview}
                    disabled={!importState.text}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  id="import-json"
                  value={importState.text}
                  onChange={(e) => setImportState((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder={`{"${importState.tab}":[{"id":"...","name":"..."}]}`}
                  className="font-mono text-xs min-h-[200px]"
                />
              </div>

              {importState.preview.length > 0 && (
                <div className="space-y-2">
                  <Label>Preview (first 5 items)</Label>
                  <ScrollArea className="h-[200px] rounded-lg border bg-muted/50 p-4">
                    <pre className="text-xs">
                      {JSON.stringify(importState.preview, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="font-medium">Expected Format:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {importState.tab === "routing" && (
                        <>
                          <li>Products: {`{"products":[{"id":"P1","name":"Product A","category":"Cat1"}]}`}</li>
                          <li>Routing: {`{"routing":[{"productId":"P1","stepNo":1,"process":"Assembly","cycleMinutes":10,"ops":2}]}`}</li>
                        </>
                      )}
                      {importState.tab === "machines" && (
                        <li>{`{"machines":[{"id":"M1","name":"Machine 1","process":"Cutting","shiftMinutes":480,"active":true}]}`}</li>
                      )}
                      {importState.tab === "skills" && (
                        <>
                          <li>People: {`{"people":[{"id":"PR1","name":"John Doe","role":"Operator"}]}`}</li>
                          <li>Machines: {`{"machines":[...]}`}</li>
                          <li>Skills: {`{"skills":[{"machineId":"M1","personId":"PR1","category":"Cat1","allowed":true}]}`}</li>
                        </>
                      )}
                      {importState.tab === "downtime" && (
                        <li>{`{"downtimes":[{"machineId":"M1","from":"2024-01-01T08:00","to":"2024-01-01T16:00","reason":"Maintenance"}]}`}</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setImportState((prev) => ({ ...prev, open: false, text: "", preview: [] }))}
                disabled={importState.loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importState.loading || !importState.text}>
                {importState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={manualDoneDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseManualDoneDialog();
            } else if (!manualDoneDialog.open) {
              setManualDoneDialog((prev) => ({ ...prev, open: true }));
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Manual Final Step Completion</DialogTitle>
              <DialogDescription>
                Confirm final-step completion and capture remaining qty details for future tracking.
              </DialogDescription>
            </DialogHeader>

            {manualDoneDialog.row && (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">Order:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.customer}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">VAS:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.vasName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Step:</span>{" "}
                    <span className="font-medium">
                      {manualDoneDialog.row.stepNo || "-"} / {manualDoneDialog.row.totalSteps}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Qty:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.qty || 0}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Is all qty ready?</Label>
                  <Select
                    value={manualDoneAllQtyReady}
                    onValueChange={(value) =>
                      setManualDoneAllQtyReady(value === "no" ? "no" : "yes")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select readiness" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes, all qty is ready</SelectItem>
                      <SelectItem value="no">No, qty is remaining</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {manualDoneAllQtyReady === "no" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Remaining Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualDoneRemainingQty}
                        onChange={(e) => setManualDoneRemainingQty(e.target.value)}
                        placeholder="Enter remaining qty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason for Remaining Qty</Label>
                      <Textarea
                        value={manualDoneReason}
                        onChange={(e) => setManualDoneReason(e.target.value)}
                        placeholder="Enter reason"
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseManualDoneDialog}
                disabled={manualDoneSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitManualDone} disabled={manualDoneSaving}>
                {manualDoneSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Mark Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Confirm Deletion
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteDialog.name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const { type, id } = deleteDialog;
                  if (type === "product") await handleDeleteProduct(id);
                  if (type === "machine") await handleDeleteMachine(id);
                  if (type === "person") await handleDeletePerson(id);
                  if (type === "downtime") await handleDeleteDowntime(id);
                  setDeleteDialog({ open: false, type: "product", id: "", name: "" });
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={resetAutopilotDialogOpen}
          onOpenChange={(open) => setResetAutopilotDialogOpen(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Reset and Rerun Autopilot?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will delete all PMS jobs and plans, recreate jobs for every VAS item with a PMS
                product match, and run autopilot to rebuild the plan. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={
                  resettingAutopilot ||
                  runningAutopilot ||
                  runningPriorityReplan ||
                  Boolean(priorityUpdatingOrderId) ||
                  Boolean(deletingPlanKey)
                }
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetAndRerunAutopilot}
                disabled={
                  resettingAutopilot ||
                  runningAutopilot ||
                  runningPriorityReplan ||
                  Boolean(priorityUpdatingOrderId) ||
                  Boolean(deletingPlanKey)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resettingAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset & Rerun
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
