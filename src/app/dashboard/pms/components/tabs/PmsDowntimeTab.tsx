import { Clock, Download, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPmsDate, formatPmsTime } from "../../utils/pmsDateFormat";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "../../utils/pmsStyles";

type Props = { ctx: any };

export function PmsDowntimeTab({ ctx }: Props) {
  return (
    <TabsContent value="downtime" className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className={`h-fit ${PMS_SECTION_CARD_CLASS}`}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Log Downtime</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Record machine unavailability periods</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="downtime-machine">Machine</Label>
              <Select
                value={ctx.newDowntime.machineId}
                onValueChange={(value) =>
                  ctx.setNewDowntime((prev: any) => ({ ...prev, machineId: value }))
                }
              >
                <SelectTrigger id="downtime-machine">
                  <SelectValue placeholder="Select machine" />
                </SelectTrigger>
                <SelectContent>
                  {ctx.machines.filter((machine: any) => machine.active).map((machine: any) => (
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
                  value={ctx.newDowntime.from}
                  onChange={(event) =>
                    ctx.setNewDowntime((prev: any) => ({ ...prev, from: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="downtime-to">To</Label>
                <Input
                  id="downtime-to"
                  type="datetime-local"
                  value={ctx.newDowntime.to}
                  onChange={(event) =>
                    ctx.setNewDowntime((prev: any) => ({ ...prev, to: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="downtime-reason">Reason</Label>
              <Textarea
                id="downtime-reason"
                placeholder="e.g., Scheduled maintenance, breakdown, etc."
                value={ctx.newDowntime.reason}
                onChange={(event) =>
                  ctx.setNewDowntime((prev: any) => ({ ...prev, reason: event.target.value }))
                }
                rows={3}
              />
            </div>

            <Button onClick={ctx.handleAddDowntime} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Log Downtime
            </Button>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className={PMS_CARD_TITLE_CLASS}>Downtime History</CardTitle>
                <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Track machine unavailability events</CardDescription>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => ctx.exportData(ctx.downtimes, "downtime.json")}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export downtime</TooltipContent>
                </Tooltip>
                <Button size="sm" variant="outline" onClick={() => ctx.openImportDialog("downtime")}>
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
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>From</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>To</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Duration</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Reason</TableHead>
                    <TableHead className={`${PMS_TABLE_HEAD_CLASS} text-right`}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ctx.downtimes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Clock className="h-8 w-8 opacity-50" />
                          <p className="text-sm">No downtime recorded</p>
                          <p className="text-xs">Machine availability is at 100%</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...ctx.downtimes]
                      .sort((left: any, right: any) => new Date(right.from).getTime() - new Date(left.from).getTime())
                      .map((entry: any) => {
                        const machine = ctx.machines.find((item: any) => item.id === entry.machineId);
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
                                <p>{formatPmsDate(fromDate)}</p>
                                <p className="text-xs text-muted-foreground">{formatPmsTime(fromDate)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <p>{formatPmsDate(toDate)}</p>
                                <p className="text-xs text-muted-foreground">{formatPmsTime(toDate)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {hours > 0 && `${hours}h `}{minutes}m
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <p className="max-w-xs truncate text-sm">
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
                                      ctx.setDeleteDialog({
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
                      })
                  )}
                </TableBody>
              </Table>
            </div>

            {ctx.downtimes.length > 0 && (
              <div className="mt-4 text-sm text-muted-foreground">
                Total: {ctx.downtimes.length} downtime event{ctx.downtimes.length !== 1 ? "s" : ""}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
