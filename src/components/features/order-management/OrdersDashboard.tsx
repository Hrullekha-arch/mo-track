
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal, Package, Calendar, Clock, UserCheck, Truck, Scissors } from "lucide-react";
import { OrderCard } from "./OrderCard";
import { Order, User } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();

  useEffect(() => {
    const ordersQuery = query(collection(db, "orders"));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
      setLoading(false);
    });

    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, []);

  const handleFilterChange = () => {};
  
  const handleOrderUpdate = (updatedOrder: Order) => {
    // This will be handled by Firestore listeners, but we can optimistically update the state
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const isFullyCompleted = (order: Order) => order.milestones.every(m => m.completed);
  const scheduledDate = (order: Order) => order.milestones.find(m => m.id === 6 || m.id === 7)?.completedAt;

  const summary = {
    pending: orders.filter(o => !isFullyCompleted(o)).length,
    scheduledToday: orders.filter(o => {
        const schedDate = scheduledDate(o);
        if (!schedDate) return false;
        const today = new Date();
        const d = new Date(schedDate);
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length,
    scheduled: orders.filter(o => scheduledDate(o)).length,
    assigned: orders.filter(o => o.assignedTo).length,
    readyForDelivery: orders.filter(o => o.milestones.find(m => m.id === 5)?.completed && !o.milestones.find(m => m.id === 7)?.completed && !isFullyCompleted(o)).length,
    stitched: orders.filter(o => o.milestones.find(m => m.id === 4)?.completed && !isFullyCompleted(o)).length,
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage and track all customer orders.</p>
        </div>
        {role === 'admin' && (
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Order
          </Button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        <SummaryCard title="Pending" value={summary.pending} icon={Package} />
        <SummaryCard title="Scheduled Today" value={summary.scheduledToday} icon={Clock} />
        <SummaryCard title="Total Scheduled" value={summary.scheduled} icon={Calendar} />
        <SummaryCard title="Assigned" value={summary.assigned} icon={UserCheck} />
        <SummaryCard title="Ready for Delivery" value={summary.readyForDelivery} icon={Truck} />
        <SummaryCard title="Stitched" value={summary.stitched} icon={Scissors} />
      </div>


      <div className="mb-6 p-4 border rounded-lg bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input placeholder="Search by name or ID..." />
            <Select onValueChange={handleFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                {users.filter(u => u.role === 'employee').map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={handleFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by installer" />
              </SelectTrigger>
              <SelectContent>
                 {users.filter(u => u.role === 'installer').map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Apply Filters
            </Button>
        </div>
      </div>
      
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {orders.map(order => (
          <OrderCard key={order.id} order={order} onUpdate={handleOrderUpdate} allUsers={users} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
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
