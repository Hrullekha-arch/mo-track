
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageCheck } from "lucide-react";

export default function PoTrackingPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">PO to Order Receive</h1>
                <p className="text-muted-foreground">Track items from Purchase Order generation to receipt.</p>
            </header>
            <Card className="text-center p-12">
                <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                    <PackageCheck className="h-8 w-8" />
                </div>
                <CardTitle>Coming Soon</CardTitle>
                <CardDescription>
                    This section is under construction.
                </CardDescription>
            </Card>
        </div>
    );
}
