import { NextResponse } from "next/server";
import {
  bomRows,
  costingRows,
  costingSummary,
  fpmsModules,
  jobCardRows,
  laborProfileRows,
  masterDataCards,
  materialMasterRows,
  preProductionOrders,
  productMasterRows,
  qcSamples,
  routingFlow,
  schedulingRows,
  wipRows,
} from "@/app/dashboard/fpms/fpmsData";

export async function GET() {
  return NextResponse.json({
    success: true,
    name: "Factory Production Management System Blueprint",
    route: "/dashboard/fpms",
    moduleCount: fpmsModules.length,
    modules: fpmsModules,
    foundations: masterDataCards,
    preProductionOrders,
    productMasterRows,
    materialMasterRows,
    laborProfileRows,
    bomRows,
    routingFlow,
    schedulingRows,
    jobCardRows,
    wipRows,
    costingRows,
    costingSummary,
    qcSamples,
  });
}
