"use client";

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
    vasOverrides: core.vasOverrides,
    createJobDialog: core.createJobDialog,
    workingHours: core.workingHours,
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
    statusQuickFilter: core.statusQuickFilter,
  });

  const jobActions = usePmsJobActions({
    role,
    user,
    toast,
    products: core.products,
    routing: core.routing,
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
    updatingLiveRowKey: core.updatingLiveRowKey,
    setUpdatingLiveRowKey: core.setUpdatingLiveRowKey,
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
          title: "Unable to open Additional VAS editor",
          description: "This PMS row could not be matched to an editable Additional VAS item.",
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
      </div>
    </TooltipProvider>
  );
}
