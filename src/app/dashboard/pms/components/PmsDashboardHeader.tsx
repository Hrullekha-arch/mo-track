import { Clock, Loader2, Package, Settings2, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { stats, categories, workingHours, setWorkingHours, handleSaveWorkingHours, savingWorkingHours } = ctx;

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
        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.products.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.products.title}`}>Total Products</CardTitle>
            <Package className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.products.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.products.value}`}>{stats.products}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.products.meta}`}>{categories.length} categories</p>
          </CardContent>
        </Card>
        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.machines.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.machines.title}`}>Active Machines</CardTitle>
            <TrendingUp className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.machines.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.machines.value}`}>{stats.activeMachines}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.machines.meta}`}>of {stats.totalMachines} total</p>
          </CardContent>
        </Card>
        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.capacity.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.capacity.title}`}>Total Capacity</CardTitle>
            <Clock className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.capacity.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.capacity.value}`}>{stats.totalCapacity}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.capacity.meta}`}>minutes per shift</p>
          </CardContent>
        </Card>
        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.workforce.card}`}>
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
    </div>
  );
}
