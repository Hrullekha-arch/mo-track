"use client";

import { Boxes, Package2, Users2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import {
  laborProfileRows,
  materialMasterRows,
  masterDataCards,
  productMasterRows,
} from "../../fpmsData";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "@/app/dashboard/pms/utils/pmsStyles";

export function FpmsMasterDataTab() {
  return (
    <TabsContent value="master-data" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {masterDataCards.map((section, index) => (
          <Card key={section.title} className={PMS_SECTION_CARD_CLASS}>
            <CardHeader className={PMS_CARD_HEADER_CLASS}>
              <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
                {index === 0 ? (
                  <Package2 className="h-5 w-5 text-sky-600" />
                ) : index === 1 ? (
                  <Boxes className="h-5 w-5 text-amber-600" />
                ) : (
                  <Users2 className="h-5 w-5 text-violet-600" />
                )}
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-3">
              {section.items.map((item) => (
                <div key={item} className="rounded-lg border bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Product Master</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Finished goods with category, variant, and size profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>SKU</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Product</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Variant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productMasterRows.map((row) => (
                    <TableRow key={row.sku}>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.variant}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Material Master</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Raw material registry with unit and cost basis.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Code</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Material</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialMasterRows.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell>{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Labour Profiles</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Skill-based artisan directory for rate calculation.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Artisan</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Skill</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laborProfileRows.map((row) => (
                    <TableRow key={`${row.artisan}-${row.skill}`}>
                      <TableCell className="font-medium">{row.artisan}</TableCell>
                      <TableCell>{row.skill}</TableCell>
                      <TableCell>{row.rateType} / {row.rate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
