import { CustomerTracking } from "@/components/features/tracking/CustomerTracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import Link from "next/link";

export default function TrackOrderPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
            <Package className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Track Your Order</CardTitle>
          <CardDescription>Enter your tracking code to see the status of your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTracking />
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} MoTrack. All rights reserved.</p>
        <p>A service by Mo Design</p>
      </footer>
    </div>
  );
}
