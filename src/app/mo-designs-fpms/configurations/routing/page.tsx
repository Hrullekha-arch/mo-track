import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoutingConfiguration } from "@/actions/resource";
import NumberField from "@/components/FormFields/NumberField";
import TextField from "@/components/FormFields/TextField";

export default async function MoDesignsRoutingPage() {
  const routes = await getRoutingConfiguration();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Routing Add Option</CardTitle>
            <CardDescription>
              Add routing stage options that can be selected after barcode scan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField label="Product Type" placeholder="Bed / Sofa / Side Table" />
            <NumberField label="Step Number" placeholder="1" />
            <TextField label="Stage Name" placeholder="Furniture Drawing / SM Approval / Workshop Start" />
            <TextField label="Checkpoint" placeholder="Approve or reject / All material available" />
            <NumberField label="Estimated Hours" placeholder="2" />
            <div className="flex flex-wrap gap-2">
              {["Demand Review", "Measurement Review", "Bed Drawing", "Furniture Drawing", "SM Approval", "BOM Release", "Workshop Start"].map((stage) => (
                <div key={stage} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {stage}
                </div>
              ))}
            </div>
            <Button>Add Routing Option</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Routing: Process Chain Sequences Builder</CardTitle>
            <CardDescription>
              Define the exact chain from demand intake to workshop start for each furniture type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {routes.map((route) => (
              <Card key={route.id} className="border-slate-200 shadow-sm">
                <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">
                      Step {route.stepNo}: {route.stageName}
                    </div>
                    <div className="text-sm text-slate-600">
                      {route.productType} - Checkpoint: {route.checkpoint}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-700">{route.estimatedHours} hr</div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
