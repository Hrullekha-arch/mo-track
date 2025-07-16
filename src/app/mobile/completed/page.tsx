
"use client";

import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Order } from "@/lib/types";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, CheckCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InstallerOrderCard } from "@/components/features/installer/MobileView";

export default function MobileCompletedPage() {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
    if (!loading && role && role !== 'installer') {
        router.push('/dashboard');
    }
  }, [user, loading, role, router]);

  const isFullyCompleted = (order: Order) => order.milestones.every(m => m.completed) && !!order.feedbackRating;

  useEffect(() => {
    if (!user) return;
    setOrdersLoading(true);
    const q = query(collection(db, "orders"), where("assignedTo", "==", user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Order))
            .filter(isFullyCompleted)
            .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
        setCompletedOrders(ordersData);
        setOrdersLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  if (loading || ordersLoading || !user) {
    return (
      <div className="bg-background min-h-screen">
          <div className="max-w-md mx-auto border-x bg-card min-h-screen p-4 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
          </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-md mx-auto border-x bg-card min-h-screen">
        <div className="p-4 space-y-6">
            <header className="flex items-center gap-4">
                <Button asChild variant="ghost" size="icon">
                    <Link href="/mobile">
                        <ArrowLeft />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Completed Tasks</h1>
                    <p className="text-muted-foreground">Your work history.</p>
                </div>
            </header>

            {completedOrders.length > 0 ? (
                <div className="space-y-4">
                {completedOrders.map((order, index) => (
                   <div key={order.id} className="relative">
                        <span className="absolute -top-2 -left-2 bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold z-10">
                            {index + 1}
                        </span>
                        <InstallerOrderCard order={order} location={null} locationError={null} />
                    </div>
                ))}
                </div>
            ) : (
                <div className="text-center p-8 border-2 border-dashed rounded-lg">
                    <CheckCheck className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="font-semibold mt-4">No completed tasks yet.</p>
                    <p className="text-sm text-muted-foreground">Finish a job to see it here.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
