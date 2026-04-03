import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Check,
  Clock,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  formatDateInZone,
  formatTimeInZone,
  IST_TIME_ZONE,
} from "@/lib/pms/time";
import {
  REQUIRED_ROUTING_FINISH_STEPS,
  normalizeText,
  toNumber,
} from "../pmsCore";

type PmsSetupTabsProps = {
  vm: any;
};

export function PmsSetupTabs({ vm }: PmsSetupTabsProps) {
  const {
    categories,
    downtimes,
    editingMachine,
    exportData,
    filteredMachines,
    filteredProducts,
    getSkillAllowed,
    handleAddCategory,
    handleAddDowntime,
    handleAddMachine,
    handleAddPerson,
    handleAddProduct,
    handleAddRoutingRow,
    handleQuickAddRoutingProcesses,
    handleSaveRouting,
    handleStartRoutingCreation,
    handleUpdateMachine,
    machineSearch,
    machines,
    newCategoryName,
    newDowntime,
    newMachine,
    newPerson,
    newProduct,
    openImportDialog,
    people,
    products,
    productSearch,
    routing,
    routingNotEnteredItems,
    routingRows,
    savingRouting,
    selectedProductId,
    setDeleteDialog,
    setEditingMachine,
    setMachineSearch,
    setNewCategoryName,
    setNewDowntime,
    setNewMachine,
    setNewPerson,
    setNewProduct,
    setProductSearch,
    setRoutingRows,
    setSelectedProductId,
    setShowInactiveMachines,
    showInactiveMachines,
    skills,
    updateSkill,
    selectedSkillMachine,
    selectedSkillPerson,
    setSelectedSkillMachine,
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
  } = vm;

  return (
    <>
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

                  <div className="rounded-lg border bg-amber-50/60 p-3">
                    <div className="mb-2">
                      <div className="text-sm font-semibold text-amber-900">Routing Not Entered</div>
                      <div className="text-xs text-amber-700">
                        Show here to create a routing for an item whose routing has not been entered.
                      </div>
                    </div>
                    {routingNotEnteredItems.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        No PMS items are currently waiting for routing creation.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {routingNotEnteredItems.map((item) => (
                          <div
                            key={`missing-routing-${item.productId}`}
                            className="flex items-center justify-between rounded-md border bg-white p-2"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="truncate text-sm font-medium">{item.productName}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                Order: {item.orderNo} | Customer: {item.customer}
                              </div>
                              <div className="truncate text-xs text-amber-700">
                                VAS: {item.vasName}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="ml-2 shrink-0"
                              onClick={() => handleStartRoutingCreation(item.productId)}
                            >
                              Show Here
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
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
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <Label className="text-xs font-medium text-muted-foreground">Add New Category</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="New category name"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCategory();
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={handleAddCategory}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Category
                        </Button>
                      </div>
                    </div>
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
                      {selectedProductId && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Embelshment work is optional. You can add any other work step, and
                          Q&amp;Q, Final Complete Kitting, and Packaging will be included in all routings.
                        </p>
                      )}
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
                      <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleQuickAddRoutingProcesses(["Embelshment work"])}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Embelshment Work
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickAddRoutingProcesses(["Q&Q"])}
                        >
                          Add Q&amp;Q
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickAddRoutingProcesses(["Final Complete Kitting"])}
                        >
                          Add Final Complete Kitting
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickAddRoutingProcesses(["Packaging"])}
                        >
                          Add Packaging
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickAddRoutingProcesses(REQUIRED_ROUTING_FINISH_STEPS)}
                        >
                          Add Standard Finish Steps
                        </Button>
                      </div>

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
                              <TableHead>Machine</TableHead>
                              <TableHead className="w-[100px]">OPS</TableHead>
                              <TableHead className="w-[80px]">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {routingRows.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center">
                                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Package className="h-8 w-8 opacity-50" />
                                    <p className="text-sm">No routing steps configured</p>
                                    <p className="text-xs">Click "Add Step" or use the quick-add buttons above.</p>
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
                                  <div className="flex max-w-[220px] flex-wrap gap-1">
                                    {machines
                                      .filter(
                                        (machine) =>
                                          machine.active !== false &&
                                          normalizeText(machine.process) === normalizeText(row.process)
                                      )
                                      .map((machine) => (
                                        <Badge key={`${row.id}-${machine.id}`} variant="outline" className="text-[10px]">
                                          {machine.name}
                                        </Badge>
                                      ))}
                                    {machines.filter(
                                      (machine) =>
                                        machine.active !== false &&
                                        normalizeText(machine.process) === normalizeText(row.process)
                                    ).length === 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        {row.process ? "No machine match" : "Enter process"}
                                      </span>
                                    )}
                                  </div>
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
                                    <p>{formatDateInZone(fromDate, { timeZone: IST_TIME_ZONE })}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatTimeInZone(fromDate, { timeZone: IST_TIME_ZONE })}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <p>{formatDateInZone(toDate, { timeZone: IST_TIME_ZONE })}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatTimeInZone(toDate, { timeZone: IST_TIME_ZONE })}
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

    </>
  );
}
