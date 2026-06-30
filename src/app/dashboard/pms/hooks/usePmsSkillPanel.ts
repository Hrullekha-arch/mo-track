import { useState } from "react";

export function usePmsSkillPanel(params: any) {
  const {
    categories,
    getSkillAllowed,
    machines,
    people,
    skills,
    toast,
    updateSkill,
  } = params;

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
  ).map((pair) => {
    const [machineId, personId] = (pair as string).split('-');
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


  return {
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
  };
}
