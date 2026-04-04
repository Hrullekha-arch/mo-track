import { Check, Download, Edit2, Eye, EyeOff, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2 } from "lucide-react";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "../../utils/pmsStyles";

type Props = { ctx: any };

export function PmsMachinesTab({ ctx }: Props) {
  return (
    <TabsContent value="machines" className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className={`h-fit ${PMS_SECTION_CARD_CLASS}`}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Add Machine</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Configure a new production machine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="machine-name">Machine Name</Label>
              <Input
                id="machine-name"
                placeholder="e.g., CNC-001"
                value={ctx.newMachine.name}
                onChange={(event) =>
                  ctx.setNewMachine((prev: any) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-process">Process</Label>
              <Input
                id="machine-process"
                placeholder="e.g., Cutting"
                value={ctx.newMachine.process}
                onChange={(event) =>
                  ctx.setNewMachine((prev: any) => ({ ...prev, process: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-minutes">Shift Duration (minutes)</Label>
              <Input
                id="shift-minutes"
                type="number"
                min={60}
                placeholder="480"
                value={ctx.newMachine.shiftMinutes}
                onChange={(event) =>
                  ctx.setNewMachine((prev: any) => ({ ...prev, shiftMinutes: event.target.value }))
                }
              />
            </div>
            <Button onClick={ctx.handleAddMachine} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Machine
            </Button>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className={PMS_CARD_TITLE_CLASS}>Machine Registry</CardTitle>
                <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Manage production machines and capacity</CardDescription>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => ctx.exportData(ctx.machines, "machines.json")}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export machines</TooltipContent>
                </Tooltip>
                <Button size="sm" variant="outline" onClick={() => ctx.openImportDialog("machines")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => ctx.setShowInactiveMachines(!ctx.showInactiveMachines)}
                >
                  {ctx.showInactiveMachines ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search machines..."
                value={ctx.machineSearch}
                onChange={(event) => ctx.setMachineSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Process</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Shift (min)</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={`${PMS_TABLE_HEAD_CLASS} text-right`}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ctx.filteredMachines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Settings2 className="h-8 w-8 opacity-50" />
                          <p className="text-sm">No machines found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    ctx.filteredMachines.map((machine: any) => (
                      <TableRow key={machine.id}>
                        <TableCell>
                          {ctx.editingMachine === machine.id ? (
                            <Input
                              defaultValue={machine.name}
                              onBlur={(event) => {
                                if (event.target.value !== machine.name) {
                                  ctx.handleUpdateMachine(machine.id, { name: event.target.value });
                                } else {
                                  ctx.setEditingMachine(null);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                              }}
                              autoFocus
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{machine.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => ctx.setEditingMachine(machine.id)}
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
                            onClick={() => ctx.handleUpdateMachine(machine.id, { active: !machine.active })}
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
                                  ctx.setDeleteDialog({
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="text-sm text-muted-foreground">
              Showing {ctx.filteredMachines.length} of {ctx.machines.length} machines
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
