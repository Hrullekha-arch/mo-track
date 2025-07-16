"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal } from "lucide-react";
import { mockOrders, mockUsers } from "@/lib/mock-data";
import { OrderCard } from "./OrderCard";
import { Order } from "@/lib/types";

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  // TODO: Implement filtering logic
  const handleFilterChange = () => {};
  
  // TODO: Implement order update logic
  const handleOrderUpdate = () => {};

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage and track all customer orders.</p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Order
        </Button>
      </header>

      <div className="mb-6 p-4 border rounded-lg bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input placeholder="Search by name or ID..." />
            <Select onValueChange={handleFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                {mockUsers.filter(u => u.role === 'employee').map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={handleFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by installer" />
              </SelectTrigger>
              <SelectContent>
                 {mockUsers.filter(u => u.role === 'installer').map(user => (
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
          <OrderCard key={order.id} order={order} onUpdate={handleOrderUpdate} />
        ))}
      </div>
    </div>
  );
}
