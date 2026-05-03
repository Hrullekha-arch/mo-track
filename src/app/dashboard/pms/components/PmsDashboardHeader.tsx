import { useMemo, useState } from "react";
import { Clock, Loader2, Package, Settings2, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_METRIC_CARD_STYLES,
  PMS_SECTION_CARD_CLASS,
} from "../utils/pmsStyles";

type Props = {
  ctx: any;
};

export function PmsDashboardHeader({ ctx }: Props) {
  const {
    stats,
    categories,
    products,
    machines,
    people,
    downtimes,
    workingHours,
    setWorkingHours,
    handleSaveWorkingHours,
    savingWorkingHours,
  } = ctx;
  const [openMetric, setOpenMetric] = useState<"products" | "machines" | "capacity" | "workforce" | null>(null);

  const detailMeta = useMemo(() => {
    const activeMachines = [...machines]
      .filter((machine: any) => machine.active)
      .sort((left: any, right: any) => String(left.name || "").localeCompare(String(right.name || "")));
    const allProducts = [...products].sort((left: any, right: any) =>
      String(left.name || "").localeCompare(String(right.name || ""))
    );
    const workforce = [...people].sort((left: any, right: any) =>
      String(left.name || "").localeCompare(String(right.name || ""))
    );
    const downtimeEvents = [...downtimes].sort((left: any, right: any) =>
      String(right.from || "").localeCompare(String(left.from || ""))
    );

    return {
      products: {
        title: "All Products",
        description: "Full PMS product list with category details.",
        content: (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniDetail label="Total Products" value={stats.products} />
              <MiniDetail label="Categories" value={categories.length} />
            </div>
            <ScrollArea className="h-[340px] rounded-lg border">
              <div className="space-y-2 p-3">
                {allProducts.length === 0 ? (
                  <EmptyDetail message="No PMS products found." />
                ) : (
                  allProducts.map((product: any) => (
                    <DetailRow
                      key={product.id}
                      title={product.name || "Unnamed Product"}
                      meta={`Category: ${product.category || "Unassigned"}`}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ),
      },
      machines: {
        title: "Active Machines",
        description: "Machine list used by PMS scheduling.",
        content: (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniDetail label="Active Machines" value={stats.activeMachines} />
              <MiniDetail label="Total Machines" value={stats.totalMachines} />
            </div>
            <ScrollArea className="h-[340px] rounded-lg border">
              <div className="space-y-2 p-3">
                {machines.length === 0 ? (
                  <EmptyDetail message="No machines found." />
                ) : (
                  [...machines]
                    .sort((left: any, right: any) => String(left.name || "").localeCompare(String(right.name || "")))
                    .map((machine: any) => (
                      <DetailRow
                        key={machine.id}
                        title={machine.name || "Unnamed Machine"}
                        meta={`${machine.process || "No process"} • ${machine.shiftMinutes || 0} min • ${
                          machine.active ? "Active" : "Inactive"
                        }`}
                      />
                    ))
                )}
              </div>
            </ScrollArea>
          </div>
        ),
      },
      capacity: {
        title: "Capacity Breakdown",
        description: "Shift capacity contributed by each active machine.",
        content: (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniDetail label="Total Capacity" value={`${stats.totalCapacity} min`} />
              <MiniDetail label="Active Machines" value={activeMachines.length} />
            </div>
            <ScrollArea className="h-[340px] rounded-lg border">
              <div className="space-y-2 p-3">
                {activeMachines.length === 0 ? (
                  <EmptyDetail message="No active machines available." />
                ) : (
                  activeMachines.map((machine: any) => (
                    <DetailRow
                      key={machine.id}
                      title={machine.name || "Unnamed Machine"}
                      meta={`${machine.process || "No process"} • ${machine.shiftMinutes || 0} minutes per shift`}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ),
      },
      workforce: {
        title: "Workforce Details",
        description: "People available in PMS and recent downtime events.",
        content: (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniDetail label="Workforce" value={stats.people} />
              <MiniDetail label="Downtime Events" value={stats.downtimeEvents} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">People</div>
              <ScrollArea className="h-[170px] rounded-lg border">
                <div className="space-y-2 p-3">
                  {workforce.length === 0 ? (
                    <EmptyDetail message="No people found." />
                  ) : (
                    workforce.map((person: any) => (
                      <DetailRow
                        key={person.id}
                        title={person.name || "Unnamed Person"}
                        meta={person.role || "No role"}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Downtime Events</div>
              <ScrollArea className="h-[170px] rounded-lg border">
                <div className="space-y-2 p-3">
                  {downtimeEvents.length === 0 ? (
                    <EmptyDetail message="No downtime events found." />
                  ) : (
                    downtimeEvents.map((event: any) => (
                      <DetailRow
                        key={event.id}
                        title={machines.find((machine: any) => machine.id === event.machineId)?.name || event.machineId || "Unknown machine"}
                        meta={`${event.reason || "No reason"} • ${event.from || "-"} to ${event.to || "-"}`}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        ),
      },
    };
  }, [categories.length, downtimes, machines, people, products, stats.activeMachines, stats.downtimeEvents, stats.people, stats.products, stats.totalCapacity, stats.totalMachines]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">PMS Control Center</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Production Management System configuration and analytics
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1.5 text-xs sm:text-sm">
          <Settings2 className="mr-2 h-4 w-4" />
          Admin Mode
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card
          className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.products.card} cursor-pointer transition hover:shadow-md`}
          onClick={() => setOpenMetric("products")}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpenMetric("products");
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.products.title}`}>Total Products</CardTitle>
            <Package className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.products.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.products.value}`}>{stats.products}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.products.meta}`}>{categories.length} categories</p>
          </CardContent>
        </Card>
        <Card
          className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.machines.card} cursor-pointer transition hover:shadow-md`}
          onClick={() => setOpenMetric("machines")}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpenMetric("machines");
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.machines.title}`}>Active Machines</CardTitle>
            <TrendingUp className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.machines.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.machines.value}`}>{stats.activeMachines}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.machines.meta}`}>of {stats.totalMachines} total</p>
          </CardContent>
        </Card>
        <Card
          className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.capacity.card} cursor-pointer transition hover:shadow-md`}
          onClick={() => setOpenMetric("capacity")}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpenMetric("capacity");
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.capacity.title}`}>Total Capacity</CardTitle>
            <Clock className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.capacity.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.capacity.value}`}>{stats.totalCapacity}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.capacity.meta}`}>minutes per shift</p>
          </CardContent>
        </Card>
        <Card
          className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.workforce.card} cursor-pointer transition hover:shadow-md`}
          onClick={() => setOpenMetric("workforce")}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpenMetric("workforce");
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.workforce.title}`}>Workforce</CardTitle>
            <Users className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.workforce.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.workforce.value}`}>{stats.people}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.workforce.meta}`}>{stats.downtimeEvents} downtime events</p>
          </CardContent>
        </Card>
      </div>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={PMS_CARD_TITLE_CLASS}>Working Hours</CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Company working window used for PMS scheduling. End time earlier than start means overnight.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-3 pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="work-start">Start</Label>
              <Input
                id="work-start"
                type="time"
                className="w-full sm:w-[150px]"
                value={workingHours.startTime}
                onChange={(event) =>
                  setWorkingHours((prev: any) => ({ ...prev, startTime: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="work-end">End</Label>
              <Input
                id="work-end"
                type="time"
                className="w-full sm:w-[150px]"
                value={workingHours.endTime}
                onChange={(event) =>
                  setWorkingHours((prev: any) => ({ ...prev, endTime: event.target.value }))
                }
              />
            </div>
            <Button className="w-full sm:w-auto" onClick={handleSaveWorkingHours} disabled={savingWorkingHours}>
              {savingWorkingHours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Hours
            </Button>
            </div>
            <div className="text-xs text-muted-foreground lg:text-right">
              Scheduling timezone: IST (UTC+05:30). Stored offset: {workingHours.timezoneOffsetMinutes} minutes.
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(openMetric)} onOpenChange={(open) => !open && setOpenMetric(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openMetric ? detailMeta[openMetric].title : "Details"}</DialogTitle>
            <DialogDescription>
              {openMetric ? detailMeta[openMetric].description : ""}
            </DialogDescription>
          </DialogHeader>
          {openMetric ? detailMeta[openMetric].content : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniDetail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function DetailRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

function EmptyDetail({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{message}</div>;
}
