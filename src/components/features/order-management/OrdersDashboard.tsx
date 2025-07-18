
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal, Package, Calendar, Clock, UserCheck, Truck, Scissors, Bot, Loader2, CheckCheck, AlertTriangle } from "lucide-react";
import { OrderCard } from "./OrderCard";
import { Order, User } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { NewOrderDialog } from "./NewOrderDialog";
import { generateInstallationSchedule, GenerateInstallationScheduleInput, GenerateInstallationScheduleOutput } from "@/ai/flows/generate-installation-schedule";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type SummaryFilterType = 'totalActive' | 'scheduledToday' | 'scheduled' | 'assigned' | 'readyForDelivery' | 'stitched' | 'completed' | 'bypassedOtp';

const salesmen = [
    "AAS (SAHOO)", "ASD (SAROJ DAS)", "ASB (ABHISHEK SINGH)", "AK (ABHISHEK CARPET)",
    "AM (MINTOO)", "BPS (PAWAN SHARMA)", "BTK (TAPESHWAR)", "CAY (ASHISH)",
    "CP (PRADEEP)", "DS (DAYAL)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "MU (MURARI)",
    "NK (NAND KISHOR)", "NKD (NEERAJ)", "RA (RAJEEV AGGARWAL)", "RSB (RAJENDRA BISHT)",
    "RK (RAJKUMAR)", "SD (SWETA)", "UMDP (UMESH)", "RB (Bhatiya)", "ANVR (Anvar)", "VD (Vishal Dubey)",
    "IS (Isha Mam)", "SHANTANU", "SONI (DEEPAK SONI)"
].sort();

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [schedule, setSchedule] = useState<GenerateInstallationScheduleOutput | null>(null);
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  const [filters, setFilters] = useState({ search: '', salesPerson: 'all', installer: 'all' });
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<SummaryFilterType>('totalActive');
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);

  const installers = users.filter(u => u.role === 'installer');
  
  useEffect(() => {
    if (!user) return;

    let ordersQuery;
    
    const baseQuery = where("isAcknowledged", "==", true);

    if (user.designation === 'CRM') {
        ordersQuery = query(collection(db, "orders"), baseQuery, where("handledByCrm", "==", user.id));
    } else {
        ordersQuery = query(collection(db, "orders"), baseQuery);
    }

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
        console.error("Firestore Orders Snapshot Error:", error);
        toast({ variant: "destructive", title: "Permission Error", description: "Could not fetch orders. Check Firestore rules."});
        setLoading(false);
    });

    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    }, (error) => {
        console.error("Firestore Users Snapshot Error:", error);
        toast({ variant: "destructive", title: "Permission Error", description: "Could not fetch users. Check Firestore rules."});
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, [user, toast]);

  const handleOrderUpdate = (updatedOrder: Order) => {
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };
  
  const isFullyCompleted = (order: Order) => Array.isArray(order.milestones) && order.milestones.every(m => m.completed) && (!!order.feedbackRating || order.bypassedOtp === true);
  const scheduledDate = (order: Order) => Array.isArray(order.milestones) ? order.milestones.find(m => m.id === 6 || m.id === 7)?.completedAt : undefined;
  
  const filteredOrders = useMemo(() => {
      return orders.filter(order => {
          
        switch (activeSummaryFilter) {
            case 'totalActive':
                if (isFullyCompleted(order)) return false;
                break;
            case 'scheduledToday':
                const schedDate = scheduledDate(order);
                if (!schedDate) return false;
                const today = new Date();
                const d = new Date(schedDate);
                if (!(d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear())) return false;
                break;
            case 'scheduled':
                if (!scheduledDate(order)) return false;
                break;
            case 'assigned':
                if (!order.assignedTo) return false;
                break;
            case 'readyForDelivery':
                if (!Array.isArray(order.milestones) || !order.milestones?.find(m => m.id === 5)?.completed) return false;
                break;
            case 'stitched':
                 if (!Array.isArray(order.milestones) || !(order.milestones?.find(m => m.id === 4)?.completed && !order.milestones?.find(m => m.id === 5)?.completed)) return false;
                break;
            case 'completed':
                if (!isFullyCompleted(order)) return false;
                break;
            case 'bypassedOtp':
                if (order.bypassedOtp !== true) return false;
                break;
            default:
                if (isFullyCompleted(order)) return false;
        }

        const searchMatch = filters.search.toLowerCase() === '' || 
                              order.customerName.toLowerCase().includes(filters.search.toLowerCase()) || 
                              order.id.toLowerCase().includes(filters.search.toLowerCase());
        
        const salesPersonMatch = filters.salesPerson === 'all' || order.salesPerson === filters.salesPerson;
        
        const installerMatch = filters.installer === 'all' || order.assignedTo === filters.installer;
        
        let crmMatch = true; 
        if (user?.designation === 'CRM') {
            crmMatch = order.handledByCrm === user.id;
        }

        return searchMatch && salesPersonMatch && installerMatch && crmMatch;
      });
  }, [orders, filters, user, activeSummaryFilter]);


  const summary = useMemo(() => {
    const activeOrders = orders.filter(o => !isFullyCompleted(o));

    return {
        totalActive: activeOrders.length,
        scheduledToday: activeOrders.filter(o => {
            const schedDate = scheduledDate(o);
            if (!schedDate) return false;
            const today = new Date();
            const d = new Date(schedDate);
            return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }).length,
        scheduled: activeOrders.filter(o => scheduledDate(o)).length,
        assigned: activeOrders.filter(o => !!o.assignedTo).length,
        readyForDelivery: activeOrders.filter(o => Array.isArray(o.milestones) && o.milestones?.find(m => m.id === 5)?.completed).length,
        stitched: activeOrders.filter(o => Array.isArray(o.milestones) && o.milestones?.find(m => m.id === 4)?.completed && !o.milestones?.find(m => m.id === 5)?.completed).length,
        completed: orders.filter(isFullyCompleted).length,
        bypassedOtp: orders.filter(o => o.bypassedOtp === true).length,
    }
  }, [orders]);


  const handleGenerateSchedule = async () => {
    setAiLoading(true);
    setSchedule(null);
    
    const unassignedOrders = filteredOrders.filter(o => !o.assignedTo);
    if (unassignedOrders.length === 0) {
      toast({ title: "No orders to schedule", description: "All visible orders are already assigned."});
      setAiLoading(false);
      return;
    }

    const installersWithLocation = installers.map((installer, i) => ({
        id: installer.id,
        name: installer.name,
        currentWorkload: orders.filter(o => o.assignedTo === installer.id).map(o => o.id),
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

    const currentSchedules = installers.reduce((acc, installer) => {
        acc[installer.id] = orders.filter(o => o.assignedTo === installer.id).map(o => o.id);
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
        title: "AI Schedule Generated",
        description: "Review the optimized installation schedule below.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error Generating Schedule",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const canManage = role === 'admin' || role === 'employee';
  const canCreateOrder = role === 'admin' || user?.designation === 'PC';
  const summaryColors = [
      'border-l-4 border-blue-500',
      'border-l-4 border-cyan-500',
      'border-l-4 border-sky-500',
      'border-l-4 border-indigo-500',
      'border-l-4 border-purple-500',
      'border-l-4 border-fuchsia-500',
      'border-l-4 border-green-500',
      'border-l-4 border-orange-500'
  ];

  return (
    <>
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage and track all customer orders.</p>
        </div>
        <div className="flex gap-2">
            {canManage && (
            <Button onClick={handleGenerateSchedule} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                AI Dispatch
            </Button>
            )}
            {canCreateOrder && (
            <Button onClick={() => setIsNewOrderDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Order
            </Button>
            )}
        </div>
      </header>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-4 mb-6">
        <SummaryBox title="Total Active" value={summary.totalActive} color={summaryColors[0]} isActive={activeSummaryFilter === 'totalActive'} onClick={() => setActiveSummaryFilter('totalActive')} />
        <SummaryBox title="Scheduled Today" value={summary.scheduledToday} color={summaryColors[1]} isActive={activeSummaryFilter === 'scheduledToday'} onClick={() => setActiveSummaryFilter('scheduledToday')} />
        <SummaryBox title="Total Scheduled" value={summary.scheduled} color={summaryColors[2]} isActive={activeSummaryFilter === 'scheduled'} onClick={() => setActiveSummaryFilter('scheduled')} />
        <SummaryBox title="Assigned" value={summary.assigned} color={summaryColors[3]} isActive={activeSummaryFilter === 'assigned'} onClick={() => setActiveSummaryFilter('assigned')} />
        <SummaryBox title="Ready for Delivery" value={summary.readyForDelivery} color={summaryColors[4]} isActive={activeSummaryFilter === 'readyForDelivery'} onClick={() => setActiveSummaryFilter('readyForDelivery')} />
        <SummaryBox title="Stitched" value={summary.stitched} color={summaryColors[5]} isActive={activeSummaryFilter === 'stitched'} onClick={() => setActiveSummaryFilter('stitched')} />
        <SummaryBox title="Total Completed" value={summary.completed} color={summaryColors[6]} isActive={activeSummaryFilter === 'completed'} onClick={() => setActiveSummaryFilter('completed')} />
        <SummaryBox title="Bypassed OTP" value={summary.bypassedOtp} color={summaryColors[7]} isActive={activeSummaryFilter === 'bypassedOtp'} onClick={() => setActiveSummaryFilter('bypassedOtp')} />
      </div>

      <div className="mb-6 p-4 border rounded-lg bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input 
              placeholder="Search by name or ID..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({...f, search: e.target.value}))}
            />
            <Select value={filters.salesPerson} onValueChange={(value) => setFilters(f => ({...f, salesPerson: value}))}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Sales Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales People</SelectItem>
                {salesmen.map(salesman => (
                    <SelectItem key={salesman} value={salesman}>{salesman}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.installer} onValueChange={(value) => setFilters(f => ({...f, installer: value}))}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by installer" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">All Installers</SelectItem>
                 {installers.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setFilters({ search: '', salesPerson: 'all', installer: 'all'})}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Clear Filters
            </Button>
        </div>
      </div>
      
      {schedule && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>AI-Generated Schedule</CardTitle>
            <CardDescription>The AI has suggested the following assignments for unassigned orders.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(schedule).map(([installerId, orderIds]) => {
              const installer = installers.find(i => i.id === installerId);
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

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {filteredOrders.length > 0 ? (
          filteredOrders.map(order => (
            <OrderCard key={order.id} order={order} onUpdate={handleOrderUpdate} allUsers={users} />
          ))
        ) : (
          <p className="text-muted-foreground col-span-full text-center py-10">No orders found matching the selected filter.</p>
        )}
      </div>
    </div>
    <NewOrderDialog
        isOpen={isNewOrderDialogOpen}
        onClose={() => setIsNewOrderDialogOpen(false)}
    />
    </>
  );
}

interface SummaryBoxProps {
    title: string;
    value: number;
    color: string;
    isActive: boolean;
    onClick: () => void;
}

function SummaryBox({ title, value, color, isActive, onClick }: SummaryBoxProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "bg-card p-4 rounded-lg shadow-sm flex items-center gap-4 transition-all duration-200 ease-in-out transform hover:scale-105",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                color,
                isActive ? "ring-2 ring-primary scale-105" : "ring-0"
            )}
        >
            <div>
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="text-2xl font-bold">{value}</p>
            </div>
        </button>
    );
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </header>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="mb-6 p-4 border rounded-lg bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        <Skeleton className="h-[450px] w-full" />
        <Skeleton className="h-[450px] w-full" />
      </div>
    </div>
  )
}
