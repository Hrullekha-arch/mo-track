"use client";

import { useCallback } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  isPmsPersonActive,
  isPmsPersonOnLeaveAt,
  isPmsPersonWeekOffAt,
} from "@/lib/pms/person-availability";
import type {
  DeleteDialogState,
  ImportState,
  ImportTab,
  PmsDowntime,
  PmsMachine,
  PmsPerson,
  PmsProduct,
  PmsRouting,
  PmsSkill,
  PmsWorkingHours,
} from "../types/pms";
import {
  appendRoutingProcesses,
  buildSkillId,
  IST_TIMEZONE_OFFSET_MINUTES,
  normalizeText,
  REQUIRED_ROUTING_FINISH_STEPS,
  toNumber,
} from "../utils/pmsHelpers";

type Params = {
  toast: any;
  categories: string[];
  products: PmsProduct[];
  routing: PmsRouting[];
  routingRows: PmsRouting[];
  machines: PmsMachine[];
  people: PmsPerson[];
  skills: PmsSkill[];
  downtimes: PmsDowntime[];
  selectedProductId: string;
  workingHours: PmsWorkingHours;
  savingWorkingHours: boolean;
  newProduct: { name: string; category: string };
  newCategoryName: string;
  newMachine: { name: string; process: string; shiftMinutes: string };
  newPerson: { name: string; role: string };
  newDowntime: { machineId: string; from: string; to: string; reason: string };
  importState: ImportState;
  selectedSkillMachine: string;
  selectedSkillPerson: string;
  copyToMachine: string;
  skillSearch: string;
  viewFilter: string;
  setWorkingHours: React.Dispatch<React.SetStateAction<PmsWorkingHours>>;
  setSavingWorkingHours: (value: boolean) => void;
  setSelectedProductId: (value: string) => void;
  setRoutingRows: React.Dispatch<React.SetStateAction<PmsRouting[]>>;
  setSavingRouting: (value: boolean) => void;
  setNewProduct: React.Dispatch<
    React.SetStateAction<{ name: string; category: string }>
  >;
  setNewCategoryName: (value: string) => void;
  setNewMachine: React.Dispatch<
    React.SetStateAction<{ name: string; process: string; shiftMinutes: string }>
  >;
  setNewPerson: React.Dispatch<
    React.SetStateAction<{ name: string; role: string }>
  >;
  setNewDowntime: React.Dispatch<
    React.SetStateAction<{ machineId: string; from: string; to: string; reason: string }>
  >;
  setImportState: React.Dispatch<React.SetStateAction<ImportState>>;
  setEditingMachine: (value: string | null) => void;
  setEditingPerson: (value: string | null) => void;
  setDeleteDialog: React.Dispatch<React.SetStateAction<DeleteDialogState>>;
  setSelectedSkillMachine: (value: string) => void;
  setSelectedSkillPerson: (value: string) => void;
  setCopyToMachine: (value: string) => void;
};

export const usePmsAdminActions = ({
  toast,
  categories,
  products,
  routing,
  routingRows,
  machines,
  people,
  skills,
  downtimes,
  selectedProductId,
  workingHours,
  savingWorkingHours,
  newProduct,
  newCategoryName,
  newMachine,
  newPerson,
  newDowntime,
  importState,
  selectedSkillMachine,
  selectedSkillPerson,
  copyToMachine,
  skillSearch,
  viewFilter,
  setWorkingHours,
  setSavingWorkingHours,
  setSelectedProductId,
  setRoutingRows,
  setSavingRouting,
  setNewProduct,
  setNewCategoryName,
  setNewMachine,
  setNewPerson,
  setNewDowntime,
  setImportState,
  setEditingMachine,
  setEditingPerson,
  setDeleteDialog,
  setSelectedSkillMachine,
  setSelectedSkillPerson,
  setCopyToMachine,
}: Params) => {
  const handleSaveWorkingHours = useCallback(async () => {
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
      toast({ title: "Working hours saved" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to save working hours",
        description: (error as Error).message,
      });
    } finally {
      setSavingWorkingHours(false);
    }
  }, [savingWorkingHours, setSavingWorkingHours, setWorkingHours, toast, workingHours]);

  const handleAddProduct = useCallback(async () => {
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
    toast({ title: "Product added successfully" });
  }, [newProduct, setNewProduct, toast]);

  const handleAddCategory = useCallback(async () => {
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
    toast({ title: "Category added successfully" });
  }, [categories, newCategoryName, setNewCategoryName, setNewProduct, toast]);

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      const relatedRouting = routing.filter((row) => row.productId === id);
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
      toast({ title: "Product deleted" });
    },
    [routing, selectedProductId, setSelectedProductId, toast]
  );

  const handleAddRoutingRow = useCallback(() => {
    const nextStep = routingRows.length ? Math.max(...routingRows.map((row) => row.stepNo)) + 1 : 1;
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
  }, [routingRows, selectedProductId, setRoutingRows]);

  const handleStartRoutingCreation = useCallback(
    (productId: string) => {
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
    },
    [routing, setRoutingRows, setSelectedProductId]
  );

  const handleQuickAddRoutingProcesses = useCallback(
    (processes: readonly string[]) => {
      if (!selectedProductId) return;
      setRoutingRows((prev) => appendRoutingProcesses(prev, selectedProductId, processes));
    },
    [selectedProductId, setRoutingRows]
  );

  const handleSaveRouting = useCallback(async () => {
    if (!selectedProductId) return;

    const rowsToSave = appendRoutingProcesses(
      routingRows,
      selectedProductId,
      REQUIRED_ROUTING_FINISH_STEPS
    );
    if (rowsToSave.length !== routingRows.length) setRoutingRows(rowsToSave);

    const stepNos = rowsToSave.map((row) => row.stepNo);
    if (new Set(stepNos).size !== stepNos.length) {
      toast({ variant: "destructive", title: "Step numbers must be unique." });
      return;
    }

    const sorted = [...rowsToSave].sort((a, b) => a.stepNo - b.stepNo);
    const isAscending = rowsToSave.every((row, index) => row.stepNo === sorted[index]?.stepNo);
    if (!isAscending) {
      toast({ variant: "destructive", title: "Step numbers must be in ascending order." });
      return;
    }

    const invalidRow = rowsToSave.find(
      (row) => row.cycleMinutes <= 0 || row.ops <= 0 || !row.process
    );
    if (invalidRow) {
      toast({ variant: "destructive", title: "All fields are required and must be positive." });
      return;
    }

    setSavingRouting(true);
    try {
      const existing = routing.filter((row) => row.productId === selectedProductId);
      const keepIds = new Set(rowsToSave.map((row) => `${selectedProductId}_${row.stepNo}`));

      await Promise.all([
        ...rowsToSave.map((row) =>
          setDoc(
            doc(db, "routing", `${selectedProductId}_${row.stepNo}`),
            {
              productId: selectedProductId,
              stepNo: row.stepNo,
              process: row.process.trim(),
              cycleMinutes: row.cycleMinutes,
              ops: row.ops,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          )
        ),
        ...existing
          .filter((row) => !keepIds.has(`${row.productId}_${row.stepNo}`))
          .map((row) => deleteDoc(doc(db, "routing", row.id))),
      ]);

      toast({ title: "Routing saved successfully" });
    } finally {
      setSavingRouting(false);
    }
  }, [routing, routingRows, selectedProductId, setRoutingRows, setSavingRouting, toast]);

  const handleAddMachine = useCallback(async () => {
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
    toast({ title: "Machine added successfully" });
  }, [newMachine, setNewMachine, toast]);

  const handleUpdateMachine = useCallback(
    async (id: string, updates: Partial<PmsMachine>) => {
      await setDoc(doc(db, "machines", id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      setEditingMachine(null);
      toast({ title: "Machine updated" });
    },
    [setEditingMachine, toast]
  );

  const handleDeleteMachine = useCallback(
    async (id: string) => {
      const relatedSkills = skills.filter((skill) => skill.machineId === id);
      if (relatedSkills.length > 0) {
        toast({
          variant: "destructive",
          title: "Cannot delete machine",
          description: "Please remove all skill assignments first.",
        });
        return;
      }
      await deleteDoc(doc(db, "machines", id));
      toast({ title: "Machine deleted" });
    },
    [skills, toast]
  );

  const handleAddPerson = useCallback(async () => {
    if (!newPerson.name) {
      toast({ variant: "destructive", title: "Person name is required." });
      return;
    }
    await addDoc(collection(db, "people"), {
      name: newPerson.name.trim(),
      role: newPerson.role.trim() || null,
      active: true,
      leaveFrom: null,
      leaveTo: null,
      leaveReason: null,
      weekOffDay: null,
      createdAt: new Date().toISOString(),
    });
    setNewPerson({ name: "", role: "" });
    toast({ title: "Person added successfully" });
  }, [newPerson, setNewPerson, toast]);

  const handleUpdatePerson = useCallback(
    async (id: string, updates: Partial<PmsPerson>) => {
      await setDoc(doc(db, "people", id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      setEditingPerson(null);
      toast({ title: "Person updated" });
    },
    [setEditingPerson, toast]
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      const relatedSkills = skills.filter((skill) => skill.personId === id);
      if (relatedSkills.length > 0) {
        toast({
          variant: "destructive",
          title: "Cannot delete person",
          description: "Please remove all skill assignments first.",
        });
        return;
      }
      await deleteDoc(doc(db, "people", id));
      toast({ title: "Person deleted" });
    },
    [skills, toast]
  );

  const handleAddDowntime = useCallback(async () => {
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
      from: new Date(newDowntime.from).toISOString(),
      to: new Date(newDowntime.to).toISOString(),
      reason: newDowntime.reason?.trim() || null,
      createdAt: new Date().toISOString(),
    });

    setNewDowntime({ machineId: "", from: "", to: "", reason: "" });
    toast({ title: "Downtime logged" });
  }, [newDowntime, setNewDowntime, toast]);

  const handleDeleteDowntime = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "machineDowntime", id));
    toast({ title: "Downtime entry deleted" });
  }, [toast]);

  const updateSkill = useCallback(
    async (machineId: string, personId: string, category: string, allowed: boolean) => {
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
    },
    [machines]
  );

  const getSkillAllowed = useCallback(
    (machineId: string, personId: string, category: string) =>
      skills.find(
        (skill) =>
          skill.machineId === machineId &&
          skill.personId === personId &&
          skill.category === category
      )?.allowed ?? false,
    [skills]
  );

  const openImportDialog = useCallback(
    (tab: ImportTab) => {
      setImportState({ open: true, tab, text: "", loading: false, preview: [] });
    },
    [setImportState]
  );

  const handleImportPreview = useCallback(() => {
    try {
      const parsed = JSON.parse(importState.text);
      const items = Array.isArray(parsed) ? parsed : parsed.items || parsed[importState.tab] || [];
      setImportState((prev) => ({ ...prev, preview: items.slice(0, 5) }));
      toast({ title: `Preview: ${items.length} items ready to import` });
    } catch (error) {
      toast({ variant: "destructive", title: "Invalid JSON", description: (error as Error).message });
    }
  }, [importState.tab, importState.text, setImportState, toast]);

  const parseImportPayload = useCallback((raw: string) => {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? { items: parsed } : parsed;
  }, []);

  const ensureProducts = useCallback(async (payload: any) => {
    const items = payload?.products || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
        const id = item.id || item.productId;
        const name = item.name || item.productName;
        const category = item.category;
        if (!id || !name || !category) return Promise.resolve();
        return setDoc(
          doc(db, "products", id),
          { name, category, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      })
    );
    return items.length;
  }, []);

  const ensureMachines = useCallback(async (payload: any) => {
    const items = payload?.machines || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
        const id = item.id || item.machineId;
        const name = item.name || item.machineName;
        const process = item.process;
        if (!id || !name || !process) return Promise.resolve();
        return setDoc(
          doc(db, "machines", id),
          {
            name,
            process,
            shiftMinutes: Number(item.shiftMinutes ?? 480),
            active: item.active !== false,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      })
    );
    return items.length;
  }, []);

  const ensurePeople = useCallback(async (payload: any) => {
    const items = payload?.people || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
        const id = item.id || item.personId;
        const name = item.name || item.personName;
        if (!id || !name) return Promise.resolve();
        return setDoc(
          doc(db, "people", id),
          {
            name,
            role: item.role || null,
            active: item.active !== false,
            leaveFrom: item.leaveFrom || null,
            leaveTo: item.leaveTo || null,
            leaveReason: item.leaveReason || null,
            weekOffDay: item.weekOffDay || null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      })
    );
    return items.length;
  }, []);

  const importRouting = useCallback(async (payload: any) => {
    const items = payload?.routing || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
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
      })
    );
    return items.length;
  }, []);

  const importSkills = useCallback(async (payload: any) => {
    const items = payload?.skills || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
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
      })
    );
    return items.length;
  }, []);

  const importDowntime = useCallback(async (payload: any) => {
    const items = payload?.downtimes || payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) return 0;
    await Promise.all(
      items.map((item: any) => {
        if (!item.machineId || !item.from || !item.to) return Promise.resolve();
        return addDoc(collection(db, "machineDowntime"), {
          machineId: item.machineId,
          from: item.from,
          to: item.to,
          reason: item.reason || null,
          createdAt: new Date().toISOString(),
        });
      })
    );
    return items.length;
  }, []);

  const handleImport = useCallback(async () => {
    setImportState((prev) => ({ ...prev, loading: true }));
    try {
      const payload = parseImportPayload(importState.text);
      if (importState.tab === "routing") {
        const countProducts = await ensureProducts(payload);
        const countRouting = await importRouting(payload);
        toast({ title: `Imported ${countRouting} routing rows (${countProducts} products)` });
      }
      if (importState.tab === "machines") {
        const count = await ensureMachines(payload);
        toast({ title: `Imported ${count} machines` });
      }
      if (importState.tab === "skills") {
        const countPeople = await ensurePeople(payload);
        const countMachines = await ensureMachines(payload);
        const count = await importSkills(payload);
        toast({ title: `Imported ${count} skills (${countPeople} people, ${countMachines} machines)` });
      }
      if (importState.tab === "downtime") {
        const count = await importDowntime(payload);
        toast({ title: `Imported ${count} downtime entries` });
      }
      setImportState({ open: false, tab: importState.tab, text: "", loading: false, preview: [] });
    } catch (error) {
      toast({ variant: "destructive", title: "Import failed", description: (error as Error).message });
      setImportState((prev) => ({ ...prev, loading: false }));
    }
  }, [
    ensureMachines,
    ensurePeople,
    ensureProducts,
    importDowntime,
    importRouting,
    importSkills,
    importState.tab,
    importState.text,
    parseImportPayload,
    setImportState,
    toast,
  ]);

  const exportData = useCallback((data: any[], filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${filename}` });
  }, [toast]);

  const getSelectedSkillCount = useCallback(() => {
    if (!selectedSkillMachine || !selectedSkillPerson) return 0;
    return categories.filter((category) =>
      getSkillAllowed(selectedSkillMachine, selectedSkillPerson, category)
    ).length;
  }, [categories, getSkillAllowed, selectedSkillMachine, selectedSkillPerson]);

  const handleBulkUpdateCurrentSelection = useCallback(async (allowed: boolean) => {
    if (!selectedSkillMachine || !selectedSkillPerson) return;
    await Promise.all(
      categories.map((category) =>
        updateSkill(selectedSkillMachine, selectedSkillPerson, category, allowed)
      )
    );
    toast({ title: `${allowed ? "Enabled" : "Disabled"} all ${categories.length} skills` });
  }, [categories, selectedSkillMachine, selectedSkillPerson, toast, updateSkill]);

  const handleCopySkills = useCallback(async () => {
    if (!selectedSkillMachine || !selectedSkillPerson || !copyToMachine) return;
    const currentSkills = categories.filter((category) =>
      getSkillAllowed(selectedSkillMachine, selectedSkillPerson, category)
    );
    await Promise.all(
      currentSkills.map((category) =>
        updateSkill(copyToMachine, selectedSkillPerson, category, true)
      )
    );
    toast({
      title: `Copied ${currentSkills.length} skills to ${
        machines.find((machine) => machine.id === copyToMachine)?.name || "selected machine"
      }`,
    });
    setCopyToMachine("");
  }, [
    categories,
    copyToMachine,
    getSkillAllowed,
    machines,
    selectedSkillMachine,
    selectedSkillPerson,
    setCopyToMachine,
    toast,
    updateSkill,
  ]);

  const handleDeleteAllSkills = useCallback(async (machineId: string, personId: string) => {
    await Promise.all(
      categories.map((category) => updateSkill(machineId, personId, category, false))
    );
    toast({ title: "All skills removed" });
  }, [categories, toast, updateSkill]);

  const getUniqueAssignments = useCallback(
    () =>
      new Set(
        skills.filter((skill) => skill.allowed).map((skill) => `${skill.machineId}-${skill.personId}`)
      ).size,
    [skills]
  );

  const getGroupedSkills = useCallback(() => {
    const now = new Date().toISOString();
    const pairs = Array.from(
      new Set(
        skills.filter((skill) => skill.allowed).map((skill) => `${skill.machineId}-${skill.personId}`)
      )
    ).map((pair) => {
      const [machineId, personId] = pair.split("-");
      return { machineId, personId };
    });

    const filtered = pairs.filter((pair) => {
      const machine = machines.find((item) => item.id === pair.machineId);
      const person = people.find((item) => item.id === pair.personId);
      const matchText = [machine?.name, machine?.process, person?.name, person?.role].join(" ");
      const matchesSearch = normalizeText(matchText).includes(normalizeText(skillSearch));
      if (!matchesSearch) return false;
      if (viewFilter === "active") {
        return (
          isPmsPersonActive(person) &&
          !isPmsPersonOnLeaveAt(person, now) &&
          !isPmsPersonWeekOffAt(person, now) &&
          skills.some(
          (skill) =>
            skill.machineId === pair.machineId && skill.personId === pair.personId && skill.allowed
          )
        );
      }
      return true;
    });

    if (viewFilter === "machine") {
      return machines
        .filter((machine) => filtered.some((pair) => pair.machineId === machine.id))
        .map((machine) => ({
          header: machine.name,
          items: filtered.filter((pair) => pair.machineId === machine.id),
        }));
    }

    if (viewFilter === "person") {
      return people
        .filter((person) => filtered.some((pair) => pair.personId === person.id))
        .map((person) => ({
          header: person.name,
          items: filtered.filter((pair) => pair.personId === person.id),
        }));
    }

    return [
      {
        header: null,
        items: filtered.sort((left, right) => {
          const leftMachine = machines.find((item) => item.id === left.machineId)?.name || "";
          const rightMachine = machines.find((item) => item.id === right.machineId)?.name || "";
          const machineCompare = leftMachine.localeCompare(rightMachine);
          if (machineCompare !== 0) return machineCompare;
          const leftPerson = people.find((item) => item.id === left.personId)?.name || "";
          const rightPerson = people.find((item) => item.id === right.personId)?.name || "";
          return leftPerson.localeCompare(rightPerson);
        }),
      },
    ];
  }, [machines, people, skillSearch, skills, viewFilter]);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialog({ open: false, type: "product", id: "", name: "" });
  }, [setDeleteDialog]);

  return {
    handleSaveWorkingHours,
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
    getSelectedSkillCount,
    handleBulkUpdateCurrentSelection,
    handleCopySkills,
    handleDeleteAllSkills,
    getUniqueAssignments,
    getGroupedSkills,
    closeDeleteDialog,
  };
};
