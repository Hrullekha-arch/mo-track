"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
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
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";


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

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSkillId = (machineId: string, personId: string, category: string) =>
  `${machineId}_${personId}_${category.replace(/[^a-zA-Z0-9]/g, "_")}`;

export default function PmsPage() {
  const { role } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<PmsProduct[]>([]);
  const [routing, setRouting] = useState<PmsRouting[]>([]);
  const [machines, setMachines] = useState<PmsMachine[]>([]);
  const [people, setPeople] = useState<PmsPerson[]>([]);
  const [skills, setSkills] = useState<PmsSkill[]>([]);
  const [downtimes, setDowntimes] = useState<PmsDowntime[]>([]);

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

    return () => {
      unsubProducts();
      unsubRouting();
      unsubMachines();
      unsubPeople();
      unsubSkills();
      unsubDowntime();
    };
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
    const isAscending = sorted.every((row, index) => row.stepNo === stepNos[index]);
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
    await addDoc(collection(db, "machineDowntime"), {
      machineId: newDowntime.machineId,
      from: newDowntime.from,
      to: newDowntime.to,
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
      <div className="container mx-auto p-6 space-y-6 max-w-[1600px]">
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
        </div>

        <Tabs defaultValue="routing" className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
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

          {/* ROUTING TAB */}
          <TabsContent value="routing" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              {/* Product Selector */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Product Selection</CardTitle>
                  <CardDescription>Choose a product to configure its routing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Product List */}
                  <ScrollArea className="h-[300px] rounded-md border">
                    <div className="p-4 space-y-2">
                      {filteredProducts.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                          No products found
                        </div>
                      )}
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all hover:border-primary",
                            selectedProductId === product.id && "border-primary bg-primary/5"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{product.name}</p>
                              <Badge variant="secondary" className="text-xs">
                                {product.category}
                              </Badge>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteDialog({
                                      open: true,
                                      type: "product",
                                      id: product.id,
                                      name: product.name,
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete product</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <Separator />

                  {/* Add New Product */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Add New Product</Label>
                    <Input
                      placeholder="Product name"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <Select
                      value={newProduct.category}
                      onValueChange={(value) => setNewProduct((prev) => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5">
                          <Input
                            placeholder="Or create new..."
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setNewProduct((prev) => ({ ...prev, category: e.currentTarget.value }));
                              }
                            }}
                          />
                        </div>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddProduct} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Product
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Routing Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Routing Steps</CardTitle>
                      <CardDescription>
                        {selectedProductId
                          ? `Configure process steps for ${products.find((p) => p.id === selectedProductId)?.name}`
                          : "Select a product to configure routing"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportData(routingRows, "routing.json")}
                            disabled={!selectedProductId || routingRows.length === 0}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export routing</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" onClick={() => openImportDialog("routing")}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </Button>
                      <Button size="sm" onClick={handleAddRoutingRow} disabled={!selectedProductId}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Step
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedProductId ? (
                    <>
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[60px]">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </TableHead>
                              <TableHead className="w-[100px]">Step</TableHead>
                              <TableHead>Process</TableHead>
                              <TableHead className="w-[140px]">Cycle (min)</TableHead>
                              <TableHead className="w-[100px]">OPS</TableHead>
                              <TableHead className="w-[80px]">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {routingRows.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center">
                                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Package className="h-8 w-8 opacity-50" />
                                    <p className="text-sm">No routing steps configured</p>
                                    <p className="text-xs">Click "Add Step" to get started</p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            {routingRows.map((row, index) => (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <div className="flex items-center justify-center">
                                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={row.stepNo}
                                    type="number"
                                    min={1}
                                    className="w-20"
                                    onChange={(e) => {
                                      const stepNo = toNumber(e.target.value);
                                      setRoutingRows((prev) => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], stepNo };
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={row.process}
                                    placeholder="e.g., Assembly"
                                    onChange={(e) => {
                                      const process = e.target.value;
                                      setRoutingRows((prev) => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], process };
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={row.cycleMinutes}
                                    onChange={(e) => {
                                      const cycleMinutes = toNumber(e.target.value);
                                      setRoutingRows((prev) => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], cycleMinutes };
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={row.ops}
                                    onChange={(e) => {
                                      const ops = toNumber(e.target.value);
                                      setRoutingRows((prev) => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], ops };
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          setRoutingRows((prev) => prev.filter((_, i) => i !== index))
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete step</TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <div className="text-sm text-muted-foreground">
                          {routingRows.length} step{routingRows.length !== 1 ? "s" : ""} configured
                        </div>
                        <Button onClick={handleSaveRouting} disabled={savingRouting || routingRows.length === 0}>
                          {savingRouting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <Save className="mr-2 h-4 w-4" />
                          Save Routing
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Package className="h-16 w-16 opacity-50 mb-4" />
                      <p className="text-lg font-medium">No Product Selected</p>
                      <p className="text-sm">Select a product from the left panel to configure routing</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* MACHINES TAB */}
          <TabsContent value="machines" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              {/* Add Machine Form */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Add Machine</CardTitle>
                  <CardDescription>Configure a new production machine</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="machine-name">Machine Name</Label>
                    <Input
                      id="machine-name"
                      placeholder="e.g., CNC-001"
                      value={newMachine.name}
                      onChange={(e) => setNewMachine((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="machine-process">Process</Label>
                    <Input
                      id="machine-process"
                      placeholder="e.g., Cutting"
                      value={newMachine.process}
                      onChange={(e) => setNewMachine((prev) => ({ ...prev, process: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shift-minutes">Shift Duration (minutes)</Label>
                    <Input
                      id="shift-minutes"
                      type="number"
                      min={60}
                      placeholder="480"
                      value={newMachine.shiftMinutes}
                      onChange={(e) => setNewMachine((prev) => ({ ...prev, shiftMinutes: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Default: 480 minutes (8 hours)</p>
                  </div>
                  <Button onClick={handleAddMachine} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Machine
                  </Button>
                </CardContent>
              </Card>

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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportData(machines, "machines.json")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export machines</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" onClick={() => openImportDialog("machines")}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowInactiveMachines(!showInactiveMachines)}
                      >
                        {showInactiveMachines ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search machines..."
                      value={machineSearch}
                      onChange={(e) => setMachineSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Table */}
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead>Process</TableHead>
                          <TableHead>Shift (min)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMachines.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Settings2 className="h-8 w-8 opacity-50" />
                                <p className="text-sm">No machines found</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredMachines.map((machine) => (
                          <TableRow key={machine.id}>
                            <TableCell>
                              {editingMachine === machine.id ? (
                                <Input
                                  defaultValue={machine.name}
                                  onBlur={(e) => {
                                    if (e.target.value !== machine.name) {
                                      handleUpdateMachine(machine.id, { name: e.target.value });
                                    } else {
                                      setEditingMachine(null);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{machine.name}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={() => setEditingMachine(machine.id)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{machine.process}</Badge>
                            </TableCell>
                            <TableCell>{machine.shiftMinutes}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={machine.active ? "default" : "secondary"}
                                onClick={() =>
                                  handleUpdateMachine(machine.id, { active: !machine.active })
                                }
                              >
                                {machine.active ? (
                                  <>
                                    <Check className="mr-1 h-3 w-3" />
                                    Active
                                  </>
                                ) : (
                                  <>
                                    <X className="mr-1 h-3 w-3" />
                                    Inactive
                                  </>
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteDialog({
                                        open: true,
                                        type: "machine",
                                        id: machine.id,
                                        name: machine.name,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete machine</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Showing {filteredMachines.length} of {machines.length} machines
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SKILLS TAB - REDESIGNED */}
              {/* SKILLS TAB - FORM-BASED REDESIGN */}
            <TabsContent value="skills" className="space-y-4">
              <div className="grid gap-6 lg:grid-cols-[500px_1fr]">
                {/* Skill Assignment Form */}
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle>Assign Skills</CardTitle>
                    <CardDescription>Select machine and person to configure capabilities</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Machine Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="skill-machine">Select Machine</Label>
                      <Select
                        value={selectedSkillMachine}
                        onValueChange={setSelectedSkillMachine}
                      >
                        <SelectTrigger id="skill-machine">
                          <SelectValue placeholder="Choose a machine..." />
                        </SelectTrigger>
                        <SelectContent>
                          {machines.filter(m => m.active).map((machine) => (
                            <SelectItem key={machine.id} value={machine.id}>
                              <div className="flex items-center justify-between w-full">
                                <span>{machine.name}</span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {machine.process}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Person Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="skill-person">Select Person</Label>
                      <Select
                        value={selectedSkillPerson}
                        onValueChange={setSelectedSkillPerson}
                      >
                        <SelectTrigger id="skill-person">
                          <SelectValue placeholder="Choose a person..." />
                        </SelectTrigger>
                        <SelectContent>
                          {people.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              <div className="flex items-center justify-between w-full">
                                <span>{person.name}</span>
                                {person.role && (
                                  <Badge variant="secondary" className="ml-2 text-xs">
                                    {person.role}
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Show Skills when both selected */}
                    {selectedSkillMachine && selectedSkillPerson && (
                      <>
                        <Separator />
                        
                        {/* Current Selection Info */}
                        <div className="p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Settings2 className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-sm">
                                  {machines.find(m => m.id === selectedSkillMachine)?.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-sm">
                                  {people.find(p => p.id === selectedSkillPerson)?.name}
                                </span>
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {getSelectedSkillCount()}/{categories.length}
                            </Badge>
                          </div>
                        </div>

                        {/* Category Skills */}
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Product Categories</Label>
                          {categories.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                              No categories available. Add products first.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {categories.map((category) => {
                                const isAllowed = getSkillAllowed(
                                  selectedSkillMachine,
                                  selectedSkillPerson,
                                  category
                                );
                                
                                return (
                                  <div
                                    key={category}
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-lg border-2 transition-all cursor-pointer hover:border-primary/50",
                                      isAllowed && "bg-green-50 border-green-500 dark:bg-green-950/20"
                                    )}
                                    onClick={() =>
                                      updateSkill(
                                        selectedSkillMachine,
                                        selectedSkillPerson,
                                        category,
                                        !isAllowed
                                      )
                                    }
                                  >
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={isAllowed}
                                        onCheckedChange={(checked) =>
                                          updateSkill(
                                            selectedSkillMachine,
                                            selectedSkillPerson,
                                            category,
                                            Boolean(checked)
                                          )
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-5 w-5"
                                      />
                                      <div className="space-y-1">
                                        <p className="font-medium text-sm">{category}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Products in this category
                                        </p>
                                      </div>
                                    </div>
                                    {isAllowed && (
                                      <Badge variant="default" className="bg-green-600">
                                        <Check className="mr-1 h-3 w-3" />
                                        Qualified
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Bulk Actions for current selection */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleBulkUpdateCurrentSelection(true)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Enable All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleBulkUpdateCurrentSelection(false)}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Disable All
                          </Button>
                        </div>

                        {/* Copy Skills Action */}
                        <div className="space-y-2">
                          <Label className="text-sm">Quick Copy</Label>
                          <div className="flex gap-2">
                            <Select
                              value={copyToMachine}
                              onValueChange={setCopyToMachine}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Copy to machine..." />
                              </SelectTrigger>
                              <SelectContent>
                                {machines
                                  .filter(m => m.active && m.id !== selectedSkillMachine)
                                  .map((machine) => (
                                    <SelectItem key={machine.id} value={machine.id}>
                                      {machine.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={handleCopySkills}
                                  disabled={!copyToMachine}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy skills to another machine</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        {/* Reset Button */}
                        <Button
                          variant="ghost"
                          className="w-full"
                          onClick={() => {
                            setSelectedSkillMachine("");
                            setSelectedSkillPerson("");
                            setCopyToMachine("");
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Assign Skills to Another
                        </Button>
                      </>
                    )}

                    {/* Initial State - No Selection */}
                    {(!selectedSkillMachine || !selectedSkillPerson) && (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Users className="h-12 w-12 opacity-50 mb-3" />
                        <p className="text-sm font-medium">Select machine and person</p>
                        <p className="text-xs">to configure their capabilities</p>
                      </div>
                    )}

                    {/* Quick Add Forms */}
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">Quick Add</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full">
                              <Plus className="mr-2 h-4 w-4" />
                              Person
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Person</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <Input
                                placeholder="Full name"
                                value={newPerson.name}
                                onChange={(e) => setNewPerson((prev) => ({ ...prev, name: e.target.value }))}
                              />
                              <Input
                                placeholder="Role (optional)"
                                value={newPerson.role}
                                onChange={(e) => setNewPerson((prev) => ({ ...prev, role: e.target.value }))}
                              />
                            </div>
                            <DialogFooter>
                              <Button onClick={handleAddPerson}>Add Person</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full">
                              <Plus className="mr-2 h-4 w-4" />
                              Machine
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Machine</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <Input
                                placeholder="Machine name"
                                value={newMachine.name}
                                onChange={(e) => setNewMachine((prev) => ({ ...prev, name: e.target.value }))}
                              />
                              <Input
                                placeholder="Process"
                                value={newMachine.process}
                                onChange={(e) => setNewMachine((prev) => ({ ...prev, process: e.target.value }))}
                              />
                            </div>
                            <DialogFooter>
                              <Button onClick={handleAddMachine}>Add Machine</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Skills Overview & History */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Skills Overview</CardTitle>
                        <CardDescription>All configured machine-person-category assignments</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => exportData(skills, "skills.json")}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export skills</TooltipContent>
                        </Tooltip>
                        <Button size="sm" variant="outline" onClick={() => openImportDialog("skills")}>
                          <Upload className="mr-2 h-4 w-4" />
                          Import
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <Card className="border-2">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold">{skills.filter(s => s.allowed).length}</div>
                          <p className="text-xs text-muted-foreground">Total Skills</p>
                        </CardContent>
                      </Card>
                      <Card className="border-2">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold">{getUniqueAssignments()}</div>
                          <p className="text-xs text-muted-foreground">Assignments</p>
                        </CardContent>
                      </Card>
                      <Card className="border-2">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold">{categories.length}</div>
                          <p className="text-xs text-muted-foreground">Categories</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Filter */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search assignments..."
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={viewFilter} onValueChange={setViewFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Assignments</SelectItem>
                          <SelectItem value="active">Active Only</SelectItem>
                          <SelectItem value="machine">Group by Machine</SelectItem>
                          <SelectItem value="person">Group by Person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Skills List */}
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-3">
                        {getGroupedSkills().length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Package className="h-12 w-12 opacity-50 mb-3" />
                            <p className="text-sm">No skills configured yet</p>
                          </div>
                        )}

                        {getGroupedSkills().map((group, groupIndex) => (
                          <div key={groupIndex} className="space-y-2">
                            {group.header && (
                              <div className="flex items-center gap-2 py-2">
                                <div className="h-px bg-border flex-1" />
                                <Badge variant="secondary">{group.header}</Badge>
                                <div className="h-px bg-border flex-1" />
                              </div>
                            )}

                            {group.items.map((item) => {
                              const machine = machines.find(m => m.id === item.machineId);
                              const person = people.find(p => p.id === item.personId);
                              const skillsForPair = skills.filter(
                                s => s.machineId === item.machineId && 
                                s.personId === item.personId && 
                                s.allowed
                              );

                              return (
                                <Card
                                  key={`${item.machineId}-${item.personId}`}
                                  className="cursor-pointer hover:border-primary/50 transition-all"
                                  onClick={() => {
                                    setSelectedSkillMachine(item.machineId);
                                    setSelectedSkillPerson(item.personId);
                                  }}
                                >
                                  <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-3">
                                          <div className="flex items-center gap-2">
                                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold text-sm">
                                              {machine?.name || 'Unknown'}
                                            </span>
                                            <Badge variant="outline" className="text-xs">
                                              {machine?.process}
                                            </Badge>
                                          </div>
                                          <span className="text-muted-foreground">→</span>
                                          <div className="flex items-center gap-2">
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold text-sm">
                                              {person?.name || 'Unknown'}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                          {skillsForPair.map((skill) => (
                                            <Badge key={skill.id} variant="secondary" className="text-xs">
                                              {skill.category}
                                            </Badge>
                                          ))}
                                          {skillsForPair.length === 0 && (
                                            <span className="text-xs text-muted-foreground">No skills assigned</span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline">
                                          {skillsForPair.length}/{categories.length}
                                        </Badge>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAllSkills(item.machineId, item.personId);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>



          {/* DOWNTIME TAB */}
          <TabsContent value="downtime" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              {/* Log Downtime */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Log Downtime</CardTitle>
                  <CardDescription>Record machine unavailability periods</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="downtime-machine">Machine</Label>
                    <Select
                      value={newDowntime.machineId}
                      onValueChange={(value) => setNewDowntime((prev) => ({ ...prev, machineId: value }))}
                    >
                      <SelectTrigger id="downtime-machine">
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                      <SelectContent>
                        {machines.filter(m => m.active).map((machine) => (
                          <SelectItem key={machine.id} value={machine.id}>
                            {machine.name} - {machine.process}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="downtime-from">From</Label>
                      <Input
                        id="downtime-from"
                        type="datetime-local"
                        value={newDowntime.from}
                        onChange={(e) => setNewDowntime((prev) => ({ ...prev, from: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="downtime-to">To</Label>
                      <Input
                        id="downtime-to"
                        type="datetime-local"
                        value={newDowntime.to}
                        onChange={(e) => setNewDowntime((prev) => ({ ...prev, to: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="downtime-reason">Reason</Label>
                    <Textarea
                      id="downtime-reason"
                      placeholder="e.g., Scheduled maintenance, breakdown, etc."
                      value={newDowntime.reason}
                      onChange={(e) => setNewDowntime((prev) => ({ ...prev, reason: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <Button onClick={handleAddDowntime} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Downtime
                  </Button>
                </CardContent>
              </Card>

              {/* Downtime History */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Downtime History</CardTitle>
                      <CardDescription>Track machine unavailability events</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportData(downtimes, "downtime.json")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export downtime</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="outline" onClick={() => openImportDialog("downtime")}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead>From</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {downtimes.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Clock className="h-8 w-8 opacity-50" />
                                <p className="text-sm">No downtime recorded</p>
                                <p className="text-xs">Machine availability is at 100%</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {downtimes
                          .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime())
                          .map((entry) => {
                            const machine = machines.find((m) => m.id === entry.machineId);
                            const fromDate = new Date(entry.from);
                            const toDate = new Date(entry.to);
                            const durationMinutes = Math.round((toDate.getTime() - fromDate.getTime()) / 60000);
                            const hours = Math.floor(durationMinutes / 60);
                            const minutes = durationMinutes % 60;

                            return (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <div className="space-y-1">
                                    <p className="font-medium">{machine?.name || "Unknown"}</p>
                                    {machine && (
                                      <Badge variant="outline" className="text-xs">
                                        {machine.process}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <p>{fromDate.toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {fromDate.toLocaleTimeString()}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <p>{toDate.toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {toDate.toLocaleTimeString()}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">
                                    {hours > 0 && `${hours}h `}
                                    {minutes}m
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <p className="text-sm max-w-xs truncate">
                                    {entry.reason || <span className="text-muted-foreground">-</span>}
                                  </p>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          setDeleteDialog({
                                            open: true,
                                            type: "downtime",
                                            id: entry.id,
                                            name: `${machine?.name || "Machine"} downtime`,
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete entry</TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>

                  {downtimes.length > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground">
                      Total: {downtimes.length} downtime event{downtimes.length !== 1 ? "s" : ""}
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
      </div>
    </TooltipProvider>
  );
}

