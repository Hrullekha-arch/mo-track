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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

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

  const [newProduct, setNewProduct] = useState({ name: "", category: "" });
  const [newMachine, setNewMachine] = useState({ name: "", process: "", shiftMinutes: "480" });
  const [newPerson, setNewPerson] = useState({ name: "", role: "" });
  const [newDowntime, setNewDowntime] = useState({ machineId: "", from: "", to: "", reason: "" });

  const [importState, setImportState] = useState<{
    open: boolean;
    tab: "routing" | "machines" | "skills" | "downtime";
    text: string;
    loading: boolean;
  }>({ open: false, tab: "routing", text: "", loading: false });

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

  if (role && role !== "admin") {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>PMS Admin Only</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            You do not have access to PMS configuration.
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
      toast({ variant: "destructive", title: "Cycle minutes, OPS, and process are required." });
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
    toast({ title: "Routing saved." });
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
  };

  const handleAddDowntime = async () => {
    if (!newDowntime.machineId || !newDowntime.from || !newDowntime.to) {
      toast({ variant: "destructive", title: "Machine, From, and To are required." });
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
    setImportState({ open: true, tab, text: "", loading: false });
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
        toast({ title: `Imported ${countRouting} routing rows (${countProducts} products).` });
      }
      if (importState.tab === "machines") {
        const count = (await ensureMachines(payload)) || 0;
        toast({ title: `Imported ${count} machines.` });
      }
      if (importState.tab === "skills") {
        const countPeople = (await ensurePeople(payload)) || 0;
        const countMachines = (await ensureMachines(payload)) || 0;
        const count = await importSkills(payload);
        toast({ title: `Imported ${count} skills (${countPeople} people, ${countMachines} machines).` });
      }
      if (importState.tab === "downtime") {
        const count = await importDowntime(payload);
        toast({ title: `Imported ${count} downtime entries.` });
      }
      setImportState({ open: false, tab: importState.tab, text: "", loading: false });
    } catch (error) {
      console.error("PMS import failed:", error);
      toast({ variant: "destructive", title: "Import failed", description: (error as Error).message });
      setImportState((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">PMS Control Center</h1>
        <p className="text-muted-foreground">
          Configure routing, capacity, and constraints for VAS production.
        </p>
      </header>

      <Tabs defaultValue="routing" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="routing">Product Routing</TabsTrigger>
          <TabsTrigger value="machines">Machine Master</TabsTrigger>
          <TabsTrigger value="skills">Capability Matrix</TabsTrigger>
          <TabsTrigger value="downtime">Downtime</TabsTrigger>
        </TabsList>

        <TabsContent value="routing">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Existing Product</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({product.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Add Product</Label>
                  <Input
                    placeholder="Product name"
                    value={newProduct.name}
                    onChange={(event) => setNewProduct((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <Input
                    placeholder="Category"
                    value={newProduct.category}
                    onChange={(event) => setNewProduct((prev) => ({ ...prev, category: event.target.value }))}
                  />
                  <Button onClick={handleAddProduct} className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between flex-row">
                <CardTitle>Routing Steps</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openImportDialog("routing")}>
                    Import JSON
                  </Button>
                  <Button size="sm" onClick={handleAddRoutingRow} disabled={!selectedProductId}>
                    <Plus className="mr-2 h-4 w-4" /> Add Step
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedProductId ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step No</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Cycle Minutes</TableHead>
                        <TableHead>OPS</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routingRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No routing steps yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {routingRows.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Input
                              value={row.stepNo}
                              type="number"
                              min={1}
                              onChange={(event) => {
                                const stepNo = toNumber(event.target.value);
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
                              onChange={(event) => {
                                const process = event.target.value;
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
                              min={1}
                              value={row.cycleMinutes}
                              onChange={(event) => {
                                const cycleMinutes = toNumber(event.target.value);
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
                              onChange={(event) => {
                                const ops = toNumber(event.target.value);
                                setRoutingRows((prev) => {
                                  const next = [...prev];
                                  next[index] = { ...next[index], ops };
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setRoutingRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Select a product to configure routing.
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleSaveRouting} disabled={!selectedProductId || savingRouting}>
                    {savingRouting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Save Routing
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="machines">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Add Machine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Machine name"
                  value={newMachine.name}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, name: event.target.value }))}
                />
                <Input
                  placeholder="Process"
                  value={newMachine.process}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, process: event.target.value }))}
                />
                <Input
                  placeholder="Shift minutes"
                  type="number"
                  min={60}
                  value={newMachine.shiftMinutes}
                  onChange={(event) => setNewMachine((prev) => ({ ...prev, shiftMinutes: event.target.value }))}
                />
                <Button onClick={handleAddMachine} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Machine
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Machines</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => openImportDialog("machines")}>
                    Import JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>Process</TableHead>
                      <TableHead>Shift (min)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machines.map((machine) => (
                      <TableRow key={machine.id}>
                        <TableCell>{machine.name}</TableCell>
                        <TableCell>{machine.process}</TableCell>
                        <TableCell>{machine.shiftMinutes}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={machine.active ? "default" : "outline"}
                            onClick={() =>
                              setDoc(
                                doc(db, "machines", machine.id),
                                { active: !machine.active, updatedAt: new Date().toISOString() },
                                { merge: true }
                              )
                            }
                          >
                            {machine.active ? "Active" : "Inactive"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {machines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No machines configured.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="skills">
          <div className="grid gap-6 lg:grid-cols-[1fr_3fr]">
            <Card>
              <CardHeader>
                <CardTitle>People</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Person name"
                  value={newPerson.name}
                  onChange={(event) => setNewPerson((prev) => ({ ...prev, name: event.target.value }))}
                />
                <Input
                  placeholder="Role"
                  value={newPerson.role}
                  onChange={(event) => setNewPerson((prev) => ({ ...prev, role: event.target.value }))}
                />
                <Button onClick={handleAddPerson} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Person
                </Button>
                <div className="pt-4 space-y-2">
                  {people.map((person) => (
                    <div key={person.id} className="flex items-center justify-between text-sm">
                      <span>{person.name}</span>
                      {person.role && <Badge variant="outline">{person.role}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Capability Matrix</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => openImportDialog("skills")}>
                    Import JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-auto">
                {machines.length === 0 || people.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Add machines and people to configure capabilities.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead>Person</TableHead>
                        {categories.map((category) => (
                          <TableHead key={category}>{category}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {machines.map((machine) =>
                        people.map((person) => (
                          <TableRow key={`${machine.id}-${person.id}`}>
                            <TableCell>{machine.name}</TableCell>
                            <TableCell>{person.name}</TableCell>
                            {categories.map((category) => (
                              <TableCell key={`${machine.id}-${person.id}-${category}`}>
                                <Checkbox
                                  checked={getSkillAllowed(machine.id, person.id, category)}
                                  onCheckedChange={(checked) =>
                                    updateSkill(machine.id, person.id, category, Boolean(checked))
                                  }
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="downtime">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Log Downtime</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={newDowntime.machineId} onValueChange={(value) => setNewDowntime((prev) => ({ ...prev, machineId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>
                        {machine.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-2">
                  <Label>From</Label>
                  <Input type="datetime-local" value={newDowntime.from} onChange={(event) => setNewDowntime((prev) => ({ ...prev, from: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>To</Label>
                  <Input type="datetime-local" value={newDowntime.to} onChange={(event) => setNewDowntime((prev) => ({ ...prev, to: event.target.value }))} />
                </div>
                <Input
                  placeholder="Reason"
                  value={newDowntime.reason}
                  onChange={(event) => setNewDowntime((prev) => ({ ...prev, reason: event.target.value }))}
                />
                <Button onClick={handleAddDowntime} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Downtime
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Downtime Entries</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => openImportDialog("downtime")}>
                    Import JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downtimes.map((entry) => {
                      const machine = machines.find((item) => item.id === entry.machineId);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{machine?.name || entry.machineId}</TableCell>
                          <TableCell>{entry.from}</TableCell>
                          <TableCell>{entry.to}</TableCell>
                          <TableCell>{entry.reason || "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                    {downtimes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No downtime recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={importState.open} onOpenChange={(open) => setImportState((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import JSON</DialogTitle>
            <DialogDescription>
              Paste JSON for the <strong>{importState.tab}</strong> tab. This will upsert records in Firestore.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importState.text}
            onChange={(event) => setImportState((prev) => ({ ...prev, text: event.target.value }))}
            placeholder='{"products":[...],"routing":[...]}'
            className="min-h-[240px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportState((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importState.loading}>
              {importState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
