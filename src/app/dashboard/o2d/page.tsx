
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function O2DPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">O2D (Order 2 Delivery)</h1>
                <p className="text-muted-foreground">Detailed end-to-end order process visualization.</p>
            </header>
            <Card className="flex items-center justify-center p-12 border-2 border-dashed">
                 <div className="text-center">
                    <Truck className="h-12 w-12 mx-auto text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-semibold">O2D Module</h2>
                    <p className="text-muted-foreground">This section will contain the detailed order process view.</p>
                </div>
            </Card>
        </div>
    );
}
