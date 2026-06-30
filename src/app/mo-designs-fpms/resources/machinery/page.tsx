import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMachineResources } from "@/actions/resource";
import TextField from "@/components/FormFields/TextField";

export default async function MoDesignsMachineryPage() {
  const machines = await getMachineResources();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Add Machine Option</CardTitle>
            <CardDescription>
              Add machine choices that appear in barcode based workshop start flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField label="Machine Code" placeholder="MC-004" />
            <TextField label="Machine Name" placeholder="Press Machine" />
            <TextField label="Category" placeholder="Cutting / Finishing / Assembly" />
            <TextField label="Process" placeholder="Wood Cutting / Sanding / Polish" />
            <div className="flex flex-wrap gap-2">
              {["Cutting", "Shaping", "Finishing", "Assembly", "Packing"].map((item) => (
                <div key={item} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {item}
                </div>
              ))}
            </div>
            <Button>Add Machine Option</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Machine: Equipment Option Builder</CardTitle>
            <CardDescription>
              Maintain machine options that can be mounted to workshop jobs during barcode start logging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {machines.map((machine) => (
              <Card key={machine.id} className="border-slate-200 shadow-sm">
                <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">{machine.name}</div>
                    <div className="text-sm text-slate-600">
                      {machine.code} - {machine.category} - {machine.process}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-700">{machine.active ? "Active" : "Inactive"}</div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
