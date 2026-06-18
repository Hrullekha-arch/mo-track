"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AllocateOrderAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  const canAccess =
    normalizedRole === "admin" ||
    (normalizedRole === "pc" && user?.isActive !== false);

  React.useEffect(() => {
    if (!loading && !canAccess) {
      router.replace("/dashboard/Sales");
    }
  }, [canAccess, loading, router]);

  if (loading || !canAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return children;
}
