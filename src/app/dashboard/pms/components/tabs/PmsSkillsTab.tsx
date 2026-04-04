import {
  Check,
  Copy,
  Download,
  Package,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
} from "../../utils/pmsStyles";

type Props = { ctx: any };

export function PmsSkillsTab({ ctx }: Props) {
  return (
    <TabsContent value="skills" className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[500px_1fr]">
        <Card className={`h-fit ${PMS_SECTION_CARD_CLASS}`}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Assign Skills</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Select machine and person to configure capabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skill-machine">Select Machine</Label>
              <Select value={ctx.selectedSkillMachine} onValueChange={ctx.setSelectedSkillMachine}>
                <SelectTrigger id="skill-machine">
                  <SelectValue placeholder="Choose a machine..." />
                </SelectTrigger>
                <SelectContent>
                  {ctx.machines.filter((machine: any) => machine.active).map((machine: any) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-person">Select Person</Label>
              <Select value={ctx.selectedSkillPerson} onValueChange={ctx.setSelectedSkillPerson}>
                <SelectTrigger id="skill-person">
                  <SelectValue placeholder="Choose a person..." />
                </SelectTrigger>
                <SelectContent>
                  {ctx.people.map((person: any) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ctx.selectedSkillMachine && ctx.selectedSkillPerson ? (
              <>
                <Separator />
                <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">
                          {ctx.machines.find((item: any) => item.id === ctx.selectedSkillMachine)?.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">
                          {ctx.people.find((item: any) => item.id === ctx.selectedSkillPerson)?.name}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {ctx.getSelectedSkillCount()}/{ctx.categories.length}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Product Categories</Label>
                  {ctx.categories.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground">
                      No categories available. Add products first.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ctx.categories.map((category: string) => {
                        const isAllowed = ctx.getSkillAllowed(
                          ctx.selectedSkillMachine,
                          ctx.selectedSkillPerson,
                          category
                        );
                        return (
                          <div
                            key={category}
                            className={cn(
                              "cursor-pointer rounded-lg border-2 p-3 transition-all hover:border-primary/50",
                              isAllowed && "border-green-500 bg-green-50 dark:bg-green-950/20"
                            )}
                            onClick={() =>
                              ctx.updateSkill(
                                ctx.selectedSkillMachine,
                                ctx.selectedSkillPerson,
                                category,
                                !isAllowed
                              )
                            }
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isAllowed}
                                  onCheckedChange={(checked) =>
                                    ctx.updateSkill(
                                      ctx.selectedSkillMachine,
                                      ctx.selectedSkillPerson,
                                      category,
                                      Boolean(checked)
                                    )
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  className="h-5 w-5"
                                />
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">{category}</p>
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => ctx.handleBulkUpdateCurrentSelection(true)}>
                    <Check className="mr-2 h-4 w-4" />
                    Enable All
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => ctx.handleBulkUpdateCurrentSelection(false)}>
                    <X className="mr-2 h-4 w-4" />
                    Disable All
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Quick Copy</Label>
                  <div className="flex gap-2">
                    <Select value={ctx.copyToMachine} onValueChange={ctx.setCopyToMachine}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Copy to machine..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ctx.machines
                          .filter((machine: any) => machine.active && machine.id !== ctx.selectedSkillMachine)
                          .map((machine: any) => (
                            <SelectItem key={machine.id} value={machine.id}>
                              {machine.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="outline" onClick={ctx.handleCopySkills} disabled={!ctx.copyToMachine}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy skills to another machine</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    ctx.setSelectedSkillMachine("");
                    ctx.setSelectedSkillPerson("");
                    ctx.setCopyToMachine("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign Skills to Another
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="mb-3 h-12 w-12 opacity-50" />
                <p className="text-sm font-medium">Select machine and person</p>
                <p className="text-xs">to configure their capabilities</p>
              </div>
            )}

            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Quick Add</Label>
              <div className="grid grid-cols-2 gap-2">
                <QuickAddDialog
                  title="Add Person"
                  triggerLabel="Person"
                  fields={
                    <>
                      <Input
                        placeholder="Full name"
                        value={ctx.newPerson.name}
                        onChange={(event) =>
                          ctx.setNewPerson((prev: any) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Role (optional)"
                        value={ctx.newPerson.role}
                        onChange={(event) =>
                          ctx.setNewPerson((prev: any) => ({ ...prev, role: event.target.value }))
                        }
                      />
                    </>
                  }
                  onSave={ctx.handleAddPerson}
                />
                <QuickAddDialog
                  title="Add Machine"
                  triggerLabel="Machine"
                  fields={
                    <>
                      <Input
                        placeholder="Machine name"
                        value={ctx.newMachine.name}
                        onChange={(event) =>
                          ctx.setNewMachine((prev: any) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Process"
                        value={ctx.newMachine.process}
                        onChange={(event) =>
                          ctx.setNewMachine((prev: any) => ({ ...prev, process: event.target.value }))
                        }
                      />
                    </>
                  }
                  onSave={ctx.handleAddMachine}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className={PMS_CARD_TITLE_CLASS}>Skills Overview</CardTitle>
                <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>All configured machine-person-category assignments</CardDescription>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => ctx.exportData(ctx.skills, "skills.json")}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export skills</TooltipContent>
                </Tooltip>
                <Button size="sm" variant="outline" onClick={() => ctx.openImportDialog("skills")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <MiniStat value={ctx.skills.filter((skill: any) => skill.allowed).length} label="Total Skills" />
              <MiniStat value={ctx.getUniqueAssignments()} label="Assignments" />
              <MiniStat value={ctx.categories.length} label="Categories" />
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assignments..."
                  value={ctx.skillSearch}
                  onChange={(event) => ctx.setSkillSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={ctx.viewFilter} onValueChange={ctx.setViewFilter}>
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

            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {ctx.getGroupedSkills().length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Package className="mb-3 h-12 w-12 opacity-50" />
                    <p className="text-sm">No skills configured yet</p>
                  </div>
                ) : (
                  ctx.getGroupedSkills().map((group: any, groupIndex: number) => (
                    <div key={groupIndex} className="space-y-2">
                      {group.header && (
                        <div className="flex items-center gap-2 py-2">
                          <div className="h-px flex-1 bg-border" />
                          <Badge variant="secondary">{group.header}</Badge>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      {group.items.map((item: any) => {
                        const machine = ctx.machines.find((entry: any) => entry.id === item.machineId);
                        const person = ctx.people.find((entry: any) => entry.id === item.personId);
                        const skillsForPair = ctx.skills.filter(
                          (skill: any) =>
                            skill.machineId === item.machineId &&
                            skill.personId === item.personId &&
                            skill.allowed
                        );

                        return (
                          <Card
                            key={`${item.machineId}-${item.personId}`}
                            className="cursor-pointer transition-all hover:border-primary/50"
                            onClick={() => {
                              ctx.setSelectedSkillMachine(item.machineId);
                              ctx.setSelectedSkillPerson(item.personId);
                            }}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-semibold">{machine?.name || "Unknown"}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {machine?.process}
                                      </Badge>
                                    </div>
                                    <span className="text-muted-foreground">→</span>
                                    <div className="flex items-center gap-2">
                                      <Users className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-semibold">{person?.name || "Unknown"}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1">
                                    {skillsForPair.map((skill: any) => (
                                      <Badge key={skill.id} variant="secondary" className="text-xs">
                                        {skill.category}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {skillsForPair.length}/{ctx.categories.length}
                                  </Badge>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      ctx.handleDeleteAllSkills(item.machineId, item.personId);
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
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}

function MiniStat({ value, label }: { value: any; label: string }) {
  return (
    <Card className="border-2">
      <CardContent className="pt-4">
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function QuickAddDialog({ title, triggerLabel, fields, onSave }: any) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">{fields}</div>
        <DialogFooter>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
