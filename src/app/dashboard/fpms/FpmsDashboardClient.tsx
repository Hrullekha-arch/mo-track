"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import {
  jobCardRows,
  materialMasterRows,
  preProductionOrders,
  productMasterRows,
  qcSamples,
} from "./fpmsData";
import { FpmsDashboardHeader } from "./components/FpmsDashboardHeader";
import { FpmsTabsList } from "./components/FpmsTabsList";
import { FpmsBomRecipeTab } from "./components/tabs/FpmsBomRecipeTab";
import { FpmsCostingTab } from "./components/tabs/FpmsCostingTab";
import { FpmsJobCardsTab } from "./components/tabs/FpmsJobCardsTab";
import { FpmsMasterDataTab } from "./components/tabs/FpmsMasterDataTab";
import { FpmsQcTab } from "./components/tabs/FpmsQcTab";
import { FpmsWipTab } from "./components/tabs/FpmsWipTab";
import { PMS_SECTION_CARD_CLASS } from "@/app/dashboard/pms/utils/pmsStyles";

type FpmsTabValue = "master-data" | "bom" | "job-cards" | "wip" | "costing" | "qc";
type DrawingStatus = "pending" | "approved" | "rejected";
type BomStatus = "locked" | "started";

type PreProductionOrder = {
  id: string;
  orderNo: string;
  customer: string;
  product: string;
  measurement: string;
  drawingNo: string;
  drawingStatus: DrawingStatus;
  barcode: string;
  smOwner: string;
  materialReady: boolean;
  bomStatus: BomStatus;
};

export default function FpmsDashboardClient() {
  const [activeTab, setActiveTab] = useState<FpmsTabValue>("master-data");
  const [qcChecks, setQcChecks] = useState<Record<string, Record<string, boolean>>>({});
  const [orderFlows, setOrderFlows] = useState<PreProductionOrder[]>(() =>
    preProductionOrders.map((row) => ({ ...row }))
  );

  const stats = useMemo(
    () => ({
      products: productMasterRows.length,
      materials: materialMasterRows.length,
      jobCards: jobCardRows.length,
      qcGates: qcSamples.length,
    }),
    []
  );

  const toggleQc = (sampleKey: string, checkpoint: string, checked: boolean) => {
    setQcChecks((prev) => ({
      ...prev,
      [sampleKey]: {
        ...(prev[sampleKey] || {}),
        [checkpoint]: checked,
      },
    }));
  };

  const handleApproveDrawing = (id: string) => {
    setOrderFlows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              drawingStatus: "approved",
              barcode: row.barcode || `BC-${row.orderNo.replace(/[^A-Z0-9]/gi, "")}`,
              bomStatus: row.materialReady ? "started" : "locked",
            }
          : row
      )
    );
  };

  const handleRejectDrawing = (id: string) => {
    setOrderFlows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              drawingStatus: "rejected",
              barcode: "",
              bomStatus: "locked",
            }
          : row
      )
    );
  };

  const handleMaterialReady = (id: string) => {
    setOrderFlows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              materialReady: true,
              bomStatus: row.drawingStatus === "approved" ? "started" : "locked",
            }
          : row
      )
    );
  };

  return (
    <div className="space-y-4">
      <FpmsDashboardHeader stats={stats} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as FpmsTabValue)}
        className="space-y-4"
      >
        <FpmsTabsList />

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4 sm:p-5">
            <FpmsMasterDataTab />
            <FpmsBomRecipeTab
              orderFlows={orderFlows}
              onMaterialReady={handleMaterialReady}
            />
            <FpmsJobCardsTab
              orderFlows={orderFlows}
              onApproveDrawing={handleApproveDrawing}
              onRejectDrawing={handleRejectDrawing}
            />
            <FpmsWipTab orderFlows={orderFlows} />
            <FpmsCostingTab />
            <FpmsQcTab qcChecks={qcChecks} onToggleQc={toggleQc} />
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
