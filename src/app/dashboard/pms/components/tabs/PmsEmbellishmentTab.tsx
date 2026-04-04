import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EmbellishmentEditor } from "../EmbellishmentEditor";
import { getOptionalDisplayText } from "../../utils/pmsHelpers";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "../../utils/pmsStyles";

type Props = {
  ctx: any;
};

export function PmsEmbellishmentTab({ ctx }: Props) {
  return (
    <TabsContent value="embellishment" className="space-y-4">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Embelshment Dashboard</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Select a VAS item and fill the Embelshment work form directly from the PMS dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                className="w-full md:w-80"
                placeholder="Search order id / name / BCN / barcode..."
                value={ctx.embellishmentSearch}
                onChange={(event) => ctx.setEmbellishmentSearch(event.target.value)}
              />
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Order No</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>VAS Item</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>PMS Product</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={`${PMS_TABLE_HEAD_CLASS} min-w-[260px] text-right`}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ctx.filteredEmbellishmentRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No VAS items available for Embelshment work.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ctx.filteredEmbellishmentRows.map((row: any) => {
                      const isSelected = ctx.createJobDialog.row?.key === row.key;
                      return (
                        <TableRow
                          key={`embellishment-${row.key}`}
                          className={cn(isSelected && "bg-primary/5")}
                        >
                          <TableCell className="font-medium">{row.orderNo}</TableCell>
                          <TableCell>{row.customer}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.vasName}</div>
                              {getOptionalDisplayText(row.group) && (
                                <div className="text-xs text-muted-foreground">
                                  {getOptionalDisplayText(row.group)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{row.matchedProductName || "No match"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">{row.status}</Badge>
                              {row.embellishment?.enabled && <Badge variant="outline">Filled</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={isSelected ? "secondary" : "outline"}
                              onClick={() => ctx.handleSelectEmbellishmentRow(row)}
                              disabled={!row.matchedProductId}
                            >
                              {isSelected ? "Selected" : "Open Form"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Embelshment Form</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              {ctx.createJobDialog.row
                ? `Fill the form for ${ctx.createJobDialog.row.vasName} and save it on the dashboard.`
                : "Select a VAS item from the left side to open the form."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <EmbellishmentEditor
              role={ctx.role}
              createJobDialog={ctx.createJobDialog}
              setCreateJobDialog={ctx.setCreateJobDialog}
              createJobTotals={ctx.createJobTotals}
              creatingJobKey={ctx.creatingJobKey}
              onFieldChange={ctx.handleCreateJobDialogFieldChange}
              onSaveDetails={ctx.handleSaveEmbellishmentDetails}
              onSubmit={ctx.handleSubmitCreateJobs}
              showSaveDetailsButton
            />
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
