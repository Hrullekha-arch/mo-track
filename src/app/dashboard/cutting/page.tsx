
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, ListChecks } from "lucide-react";
import Link from "next/link";

export default function CuttingPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Cutting & Details</h1>
                <p className="text-muted-foreground">Manage fabric cutting and view cutting details.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Link href="#">
                    <Card className="group hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
                        <CardHeader>
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-lg bg-pink-500">
                                    <Scissors className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-grow">
                                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                                        Order Fabric Cutting
                                    </CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                 <Link href="#">
                    <Card className="group hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
                        <CardHeader>
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-lg bg-indigo-500">
                                    <ListChecks className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-grow">
                                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                                        Cutting Details
                                    </CardTitle>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
