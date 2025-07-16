"use client";

import { useState } from 'react';
import { generateInstallationSchedule, GenerateInstallationScheduleInput, GenerateInstallationScheduleOutput } from '@/ai/flows/generate-installation-schedule';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { mockInstallers, mockOrders } from '@/lib/mock-data';
import { Bot, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

export function DispatcherAssistant() {
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<GenerateInstallationScheduleOutput | null>(null);
  const { toast } = useToast();

  const handleGenerateSchedule = async () => {
    setLoading(true);
    setSchedule(null);

    const unassignedOrders = mockOrders.filter(o => !o.assignedTo);
    const installersWithLocation = mockInstallers.map((installer, i) => ({
        id: installer.id,
        name: installer.name,
        currentWorkload: mockOrders.filter(o => o.assignedTo === installer.id).map(o => o.id),
        // Mock location for demo
        location: { latitude: 34.0522 + i * 0.1, longitude: -118.2437 + i * 0.1 }
    }));
    
    const ordersWithLocation = unassignedOrders.map((order, i) => ({
        id: order.id,
        // Mock location for demo
        deliveryLocation: { latitude: 34.0522 - i * 0.05, longitude: -118.2437 - i*0.05 },
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        orderType: order.orderType
    }));

    const currentSchedules = mockInstallers.reduce((acc, installer) => {
        acc[installer.id] = mockOrders.filter(o => o.assignedTo === installer.id).map(o => o.id);
        return acc;
    }, {} as Record<string, string[]>);


    const input: GenerateInstallationScheduleInput = {
      installers: installersWithLocation,
      orders: ordersWithLocation,
      currentSchedules,
    };

    try {
      const result = await generateInstallationSchedule(input);
      setSchedule(result);
      toast({
        title: "Schedule Generated",
        description: "The AI has generated an optimized installation schedule.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error Generating Schedule",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
         <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Dispatcher Assistant</h1>
            <p className="text-muted-foreground">Generate optimized installation schedules with AI.</p>
        </div>
        <Button onClick={handleGenerateSchedule} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Bot className="mr-2 h-4 w-4" />
          )}
          Generate Schedule
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Available Installers</CardTitle>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-48">
                <ul className="space-y-2">
                    {mockInstallers.map(installer => (
                        <li key={installer.id} className="text-sm">{installer.name} - {mockOrders.filter(o => o.assignedTo === installer.id).length} jobs</li>
                    ))}
                </ul>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Unassigned Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
                 <ul className="space-y-2">
                    {mockOrders.filter(o => !o.assignedTo).map(order => (
                        <li key={order.id} className="text-sm">{order.id} - {order.customerName}</li>
                    ))}
                </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {schedule && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Optimized Schedule</CardTitle>
            <CardDescription>Review and approve the AI-generated schedule.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(schedule).map(([installerId, orderIds]) => {
              const installer = mockInstallers.find(i => i.id === installerId);
              return (
                <Card key={installerId}>
                  <CardHeader>
                    <CardTitle>{installer?.name || 'Unknown Installer'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {orderIds.length > 0 ? (
                        <ul className="space-y-2">
                        {orderIds.map(orderId => (
                            <li key={orderId} className="text-sm p-2 border rounded-md bg-muted/50">{orderId}</li>
                        ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">No new assignments.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}
       {!schedule && !loading && (
        <div className="mt-8 text-center p-12 border-2 border-dashed rounded-lg">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Ready to schedule?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Click &quot;Generate Schedule&quot; to get an optimized plan.
          </p>
        </div>
      )}
    </div>
  );
}
