import { Check, Clock, Eye, ListChecks, Package, Settings2, TrendingUp, Users } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PmsTabsList() {
  return (
    <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1 md:grid-cols-8">
      <TabsTrigger value="live" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Eye className="h-4 w-4" />
        Live VAS
      </TabsTrigger>
      <TabsTrigger value="status" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <TrendingUp className="h-4 w-4" />
        Work Status
      </TabsTrigger>
      <TabsTrigger value="work" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <ListChecks className="h-4 w-4" />
        Work Detail
      </TabsTrigger>
      <TabsTrigger value="embellishment" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Check className="h-4 w-4" />
        Additional VAS
      </TabsTrigger>
      <TabsTrigger value="routing" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Package className="h-4 w-4" />
        Routing
      </TabsTrigger>
      <TabsTrigger value="machines" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Settings2 className="h-4 w-4" />
        Machines
      </TabsTrigger>
      <TabsTrigger value="skills" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Users className="h-4 w-4" />
        Skills
      </TabsTrigger>
      <TabsTrigger value="downtime" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
        <Clock className="h-4 w-4" />
        Downtime
      </TabsTrigger>
    </TabsList>
  );
}
