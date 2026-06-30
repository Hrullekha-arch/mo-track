"use client";

import { Calculator, IndianRupee } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { costingRows, costingSummary } from "../../fpmsData";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "@/app/dashboard/pms/utils/pmsStyles";

export function FpmsCostingTab() {
  return (
    <TabsContent value="costing" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {costingSummary.map((item, index) => (
          <Card
            key={item.label}
            className={`${PMS_SECTION_CARD_CLASS} ${
              index === 3 ? "border-slate-900 bg-slate-950 text-white" : ""
            }`}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <IndianRupee className={`h-8 w-8 ${index === 3 ? "text-emerald-300" : "text-emerald-600"}`} />
              <div>
                <div className={`text-sm ${index === 3 ? "text-slate-300" : "text-slate-500"}`}>{item.label}</div>
                <div className={`text-2xl font-semibold ${index === 3 ? "text-white" : "text-slate-950"}`}>
                  {item.value}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <Calculator className="h-5 w-5 text-amber-600" />
            Cost Build-up Logic
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Total production cost is the sum of material, labour, and overhead recovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Cost component</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>How it is calculated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costingRows.map((row) => (
                  <TableRow key={row.component}>
                    <TableCell className="font-medium">{row.component}</TableCell>
                    <TableCell>{row.formula}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border bg-slate-50/75 p-4 text-sm text-slate-700">
            Total Production Cost = Material Cost + Total Labour Charges + Overheads
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
