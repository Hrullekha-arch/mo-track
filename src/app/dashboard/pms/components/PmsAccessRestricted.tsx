import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PMS_CARD_HEADER_CLASS, PMS_CARD_TITLE_CLASS } from "../utils/pmsStyles";

export function PmsAccessRestricted() {
  return (
    <div className="container mx-auto p-6">
      <Card className="border-destructive">
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Access Restricted</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          You do not have authorized access to the PMS Control Center. Please contact your administrator.
        </CardContent>
      </Card>
    </div>
  );
}
