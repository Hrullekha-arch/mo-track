"use client";

import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TabsContent } from "@/components/ui/tabs";
import { qcSamples } from "../../fpmsData";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
} from "@/app/dashboard/pms/utils/pmsStyles";

type Props = {
  qcChecks: Record<string, Record<string, boolean>>;
  onToggleQc: (sampleKey: string, checkpoint: string, checked: boolean) => void;
};

export function FpmsQcTab({ qcChecks, onToggleQc }: Props) {
  return (
    <TabsContent value="qc" className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {qcSamples.map((sample) => {
          const sampleState = qcChecks[sample.key] || {};
          const allChecked = sample.checkpoints.every((checkpoint) => sampleState[checkpoint]);

          return (
            <Card key={sample.key} className={PMS_SECTION_CARD_CLASS}>
              <CardHeader className={PMS_CARD_HEADER_CLASS}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
                      <ClipboardCheck className="h-5 w-5 text-violet-600" />
                      {sample.product}
                    </CardTitle>
                    <CardDescription className={`${PMS_CARD_DESCRIPTION_CLASS} mt-1`}>
                      Current stage: {sample.stage}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      allChecked
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {allChecked ? "Ready for next step" : "Checkpoints pending"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-3">
                <div className="space-y-3 rounded-lg border p-4">
                  {sample.checkpoints.map((checkpoint) => {
                    const checked = Boolean(sampleState[checkpoint]);

                    return (
                      <label
                        key={checkpoint}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border bg-slate-50/70 px-3 py-3"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => onToggleQc(sample.key, checkpoint, value === true)}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">{checkpoint}</div>
                          <div className="text-xs text-slate-500">
                            Mark this checkpoint complete before the stage can move ahead.
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-slate-600">
                    {allChecked ? (
                      <span className="inline-flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        All checkpoints are complete. Next step can now start.
                      </span>
                    ) : (
                      "Tick every checkpoint first, then the next stage unlocks."
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Rework
                    </Button>
                    <Button disabled={!allChecked}>{sample.nextLabel}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TabsContent>
  );
}
