
import { CustomerTracking } from "@/components/features/tracking/CustomerTracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function TrackOrderPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Image
            src="/logo.png"
            alt="MoTrack Logo"
            width={150}
            height={75}
            loading="eager"
            style={{ height: "auto" }}
            className="mx-auto mb-4"
          />
          <CardTitle className="text-2xl font-bold">Track Your Order</CardTitle>
          <CardDescription>Enter your tracking code to see the status of your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTracking />
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Mo Designs Pvt. Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
