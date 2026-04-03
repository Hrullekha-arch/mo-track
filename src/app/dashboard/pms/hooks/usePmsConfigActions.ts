import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  PmsMachine,
  PmsPerson,
  REQUIRED_ROUTING_FINISH_STEPS,
  appendRoutingProcesses,
  buildSkillId,
  normalizeText,
  toNumber,
} from "../pmsCore";

export function usePmsConfigActions(params: any) {
  const {
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
  } = params;

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

  const handleAddCategory = async () => {
    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      toast({ variant: "destructive", title: "Category name is required." });
      return;
    }

    const normalized = normalizeText(categoryName);
    const existing = categories.some((category) => normalizeText(category) === normalized);
    if (existing) {
      setNewProduct((prev) => ({ ...prev, category: categoryName }));
      setNewCategoryName("");
      toast({ title: "Category already exists", description: "Selected the existing category." });
      return;
    }

    await addDoc(collection(db, "pmsCategories"), {
      name: categoryName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setNewProduct((prev) => ({ ...prev, category: categoryName }));
    setNewCategoryName("");
    toast({ title: "âœ“ Category added successfully" });
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

  const handleStartRoutingCreation = (productId: string) => {
    setSelectedProductId(productId);
    setRoutingRows((prev) => {
      const savedRows = routing
        .filter((row) => row.productId === productId)
        .sort((a, b) => a.stepNo - b.stepNo);
      if (savedRows.length) return savedRows;

      const localRows = prev
        .filter((row) => row.productId === productId && String(row.id || "").startsWith("local-"))
        .sort((a, b) => a.stepNo - b.stepNo);
      if (localRows.length) return localRows;

      return [
        {
          id: `local-${Date.now()}`,
          productId,
          stepNo: 1,
          process: "",
          cycleMinutes: 0,
          ops: 1,
        },
      ];
    });
  };

  const handleQuickAddRoutingProcesses = (processes: readonly string[]) => {
    if (!selectedProductId) return;
    setRoutingRows((prev) => appendRoutingProcesses(prev, selectedProductId, processes));
  };

  const handleSaveRouting = async () => {
    if (!selectedProductId) return;
    const rowsToSave = appendRoutingProcesses(
      routingRows,
      selectedProductId,
      REQUIRED_ROUTING_FINISH_STEPS
    );
    if (rowsToSave.length !== routingRows.length) {
      setRoutingRows(rowsToSave);
    }

    const stepNos = rowsToSave.map((row) => row.stepNo);
    const uniqueSteps = new Set(stepNos);
    if (uniqueSteps.size !== stepNos.length) {
      toast({ variant: "destructive", title: "Step numbers must be unique." });
      return;
    }
    const sorted = [...rowsToSave].sort((a, b) => a.stepNo - b.stepNo);

    const isAscending = rowsToSave.every((row, idx) => row.stepNo === sorted[idx]?.stepNo);
    if (!isAscending) {
      toast({ variant: "destructive", title: "Step numbers must be in ascending order." });
      return;
    }

    const invalidRow = rowsToSave.find((row) => row.cycleMinutes <= 0 || row.ops <= 0 || !row.process);
    if (invalidRow) {
      toast({ variant: "destructive", title: "All fields are required and must be positive." });
      return;
    }

    setSavingRouting(true);
    const existing = routing.filter((row) => row.productId === selectedProductId);
    const keepIds = new Set(rowsToSave.map((row) => `${selectedProductId}_${row.stepNo}`));

    const updates = rowsToSave.map((row) => {
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


  return {
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
  };
}
