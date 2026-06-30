"use client";

import { Boxes, ClipboardCheck, Factory, Package2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PMS_METRIC_CARD_STYLES,
  PMS_SECTION_CARD_CLASS,
} from "@/app/dashboard/pms/utils/pmsStyles";

type Props = {
  stats: {
    products: number;
    materials: number;
    jobCards: number;
    qcGates: number;
  };
};

export function FpmsDashboardHeader({ stats }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">FPMS Control Center</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Factory production planning, BOM setup, job card scheduling, costing, and checkpoint quality flow
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1.5 text-xs sm:text-sm">
          <Factory className="mr-2 h-4 w-4" />
          Factory Mode
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.products.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.products.title}`}>
              Product Masters
            </CardTitle>
            <Package2 className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.products.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.products.value}`}>{stats.products}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.products.meta}`}>finished goods configured</p>
          </CardContent>
        </Card>

        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.machines.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.machines.title}`}>
              Material Lines
            </CardTitle>
            <Boxes className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.machines.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.machines.value}`}>{stats.materials}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.machines.meta}`}>raw materials and BOM inputs</p>
          </CardContent>
        </Card>

        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.capacity.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.capacity.title}`}>
              Job Cards
            </CardTitle>
            <Workflow className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.capacity.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.capacity.value}`}>{stats.jobCards}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.capacity.meta}`}>planned production orders</p>
          </CardContent>
        </Card>

        <Card className={`${PMS_SECTION_CARD_CLASS} ${PMS_METRIC_CARD_STYLES.workforce.card}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3 pb-2">
            <CardTitle className={`text-sm font-semibold ${PMS_METRIC_CARD_STYLES.workforce.title}`}>
              QC Gates
            </CardTitle>
            <ClipboardCheck className={`h-4 w-4 ${PMS_METRIC_CARD_STYLES.workforce.icon}`} />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className={`text-xl font-bold ${PMS_METRIC_CARD_STYLES.workforce.value}`}>{stats.qcGates}</div>
            <p className={`text-xs ${PMS_METRIC_CARD_STYLES.workforce.meta}`}>checkpoint-driven handoff stages</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
