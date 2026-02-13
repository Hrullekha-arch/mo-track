
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2 } from "lucide-react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { PurchaseRequestTable } from "@/components/features/purchase/PurchaseRequestTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ACTIVE_PURCHASE_STATUSES: PurchaseRequest["status"][] = [
  "Pending Approval",
  "Approved",
  "PO Generated",
  "Cancelled",
];
const HISTORY_PURCHASE_STATUSES = ["Completed", "completed", "Received", "received"] as const;

export default function PurchasePage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"active" | "history">("active");
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [counts, setCounts] = useState({ active: 0, completed: 0 });

  useEffect(() => {
    if (!user) {
      setLoadingCounts(false);
      return;
    }

    let isCancelled = false;
    const loadCounts = async () => {
      setLoadingCounts(true);
      try {
        const [activeSnap, completedSnap] = await Promise.all([
          getCountFromServer(
            query(collection(db, "purchaseRequests"), where("status", "in", ACTIVE_PURCHASE_STATUSES))
          ),
          getCountFromServer(
            query(collection(db, "purchaseRequests"), where("status", "in", [...HISTORY_PURCHASE_STATUSES]))
          ),
        ]);

        if (!isCancelled) {
          setCounts({
            active: activeSnap.data().count,
            completed: completedSnap.data().count,
          });
        }
      } catch (error) {
        console.error("Error fetching purchase request counts:", error);
        if (!isCancelled) {
          setCounts({ active: 0, completed: 0 });
        }
      } finally {
        if (!isCancelled) {
          setLoadingCounts(false);
        }
      }
    };

    void loadCounts();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  const renderRequestCount = (value: number) => {
    if (loadingCounts) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    return value;
  };

  return (
    <div className="space-y-4 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Process</h1>
        <p className="text-muted-foreground">
          Manage and track all purchase requests from authorization to placing the order.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow">
          <Link href="/dashboard/purchase/pending-po">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>SO to PO</CardTitle>
                <CardDescription>Generate purchase orders from sales orders.</CardDescription>
              </div>
              <ArrowRight className="h-6 w-6 text-primary" />
            </CardHeader>
          </Link>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active Purchases</CardTitle>
            <CardDescription>Requests currently in the workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{renderRequestCount(counts.active)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed Purchases</CardTitle>
            <CardDescription>Fully received purchase requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{renderRequestCount(counts.completed)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as "active" | "history")}
        className="w-full pt-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Active Purchases</TabsTrigger>
          <TabsTrigger value="history">Purchase History</TabsTrigger>
        </TabsList>
      </Tabs>

      <PurchaseRequestTable mode={mode} />
    </div>
  );
}
