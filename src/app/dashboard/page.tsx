

import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClipboardList, ShoppingCart, Users, Truck, PackageCheck, Archive, Table, GanttChartSquare, CheckCircle, AlertTriangle, Warehouse, Contact, HomeIcon, FileSignature, CheckSquare as CheckSquareIcon, FileText, Scissors, DollarSign, UserCheck, Activity, BarChart3 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
];

const chartConfig = {
  desktop: {
    label: "Orders",
    color: "hsl(var(--primary))",
  },
}

export default async function DashboardPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Here's a summary of your operations.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹45,231.89</div>
                        <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+2350</div>
                        <p className="text-xs text-muted-foreground">+180.1% from last month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New Customers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+12</div>
                        <p className="text-xs text-muted-foreground">+19% from last month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+573</div>
                        <p className="text-xs text-muted-foreground">+201 since last hour</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Orders Overview</CardTitle>
                        <CardDescription>A summary of orders over the last 6 months.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[300px] w-full">
                            <BarChart accessibilityLayer data={chartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                dataKey="month"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => value.slice(0, 3)}
                                />
                                <YAxis />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>Updates from your team and system.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                             <Avatar>
                                <AvatarImage src="https://placehold.co/100x100.png" data-ai-hint="avatar" />
                                <AvatarFallback>SA</AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                                <p className="font-medium">Sanjay Arora</p>
                                <p className="text-muted-foreground">Marked "Stitching Done" for MOTRACK-1024</p>
                            </div>
                            <time className="ml-auto text-xs text-muted-foreground">5m ago</time>
                        </div>
                        <div className="flex items-center gap-4">
                             <Avatar>
                                <AvatarImage src="https://placehold.co/100x100.png" data-ai-hint="avatar" />
                                <AvatarFallback>RK</AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                                <p className="font-medium">Ravi Kumar</p>
                                <p className="text-muted-foreground">Assigned to MOTRACK-1023</p>
                            </div>
                            <time className="ml-auto text-xs text-muted-foreground">1h ago</time>
                        </div>
                         <div className="flex items-center gap-4">
                            <Avatar className="bg-blue-100 text-blue-600">
                                <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                                <p className="font-medium">System</p>
                                <p className="text-muted-foreground">New order created from Sheet: MOTRACK-1025</p>
                            </div>
                            <time className="ml-auto text-xs text-muted-foreground">2h ago</time>
                        </div>
                         <div className="flex items-center gap-4">
                            <Avatar>
                                <AvatarImage src="https://placehold.co/100x100.png" data-ai-hint="avatar" />
                                <AvatarFallback>VP</AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                                <p className="font-medium">Vikas Patel</p>
                                <p className="text-muted-foreground">Completed installation for MOTRACK-1020</p>
                            </div>
                            <time className="ml-auto text-xs text-muted-foreground">1d ago</time>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}