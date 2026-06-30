"use client";

import { Boxes, Calculator, ClipboardCheck, Package2, PackageCheck, Workflow } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function FpmsTabsList() {
  return (
    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-3 xl:grid-cols-6">
      <TabsTrigger value="master-data" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Package2 className="h-4 w-4" />
        Master Data
      </TabsTrigger>
      <TabsTrigger value="bom" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Boxes className="h-4 w-4" />
        BOM & Recipe
      </TabsTrigger>
      <TabsTrigger value="job-cards" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Workflow className="h-4 w-4" />
        Job Cards
      </TabsTrigger>
      <TabsTrigger value="wip" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <PackageCheck className="h-4 w-4" />
        WIP Tracking
      </TabsTrigger>
      <TabsTrigger value="costing" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Calculator className="h-4 w-4" />
        Costing
      </TabsTrigger>
      <TabsTrigger value="qc" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <ClipboardCheck className="h-4 w-4" />
        QC & Finished
      </TabsTrigger>
    </TabsList>
  );
}
