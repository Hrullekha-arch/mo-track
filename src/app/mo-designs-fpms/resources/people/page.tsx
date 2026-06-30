import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeopleResources } from "@/actions/resource";
import TextField from "@/components/FormFields/TextField";

export default async function MoDesignsPeoplePage() {
  const people = await getPeopleResources();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Employee Add Option</CardTitle>
            <CardDescription>
              Add employee, helper, supervisor, or artisan options for barcode based workshop mounting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField label="Employee Name" placeholder="Ajay Kumar" />
            <TextField label="Role" placeholder="Artisan / Supervisor / Helper" />
            <TextField label="Helper Type" placeholder="Carpenter / Upholstery / Polish" />
            <TextField label="Mobile Number" placeholder="9000000001" />
            <div className="flex flex-wrap gap-2">
              {["Artisan", "Supervisor", "Helper", "Painter", "SM"].map((role) => (
                <div key={role} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {role}
                </div>
              ))}
            </div>
            <Button>Add Employee Option</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Person / Helper: Worker Entries Registry</CardTitle>
            <CardDescription>
              Register workers, helpers, supervisors, and specialist roles for live workshop mounting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {people.map((person) => (
              <Card key={person.id} className="border-slate-200 shadow-sm">
                <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">{person.name}</div>
                    <div className="text-sm text-slate-600">
                      {person.role} - {person.helperType || "No helper type"} - {person.mobile || "No mobile"}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-700">{person.active ? "Active" : "Inactive"}</div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
