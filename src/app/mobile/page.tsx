"use client";

import { MobileView } from "@/components/features/installer/MobileView";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeDialog } from "@/components/features/user-management/WelcomeDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListTodo, History } from "lucide-react";
import Link from "next/link";
import { useInstallerTracking } from "@/hooks/useInstallerTracking";
import { getAuth } from "firebase/auth"; // ✅ add

export default function MobilePage() {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);

  // ✅ Get Firebase Auth user (needed for ID token)
  const firebaseUser = getAuth().currentUser;

  useEffect(() => {
    if (!loading && user) {
      const hasSeenWelcome = sessionStorage.getItem("hasSeenWelcome");
      if (!hasSeenWelcome) {
        setShowWelcome(true);
        sessionStorage.setItem("hasSeenWelcome", "true");
      }
    }
  }, [user, loading]);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    if (!loading && role && String(role).toLowerCase() !== "installer") {
      router.push("/dashboard");
    }
  }, [user, loading, role, router]);

  // ✅ Tracking enabled only when:
  // - not loading
  // - role is installer
  // - firebase auth user is available
  const tracking = useInstallerTracking({
    enabled:
      !loading &&
      !!user &&
      String(role).toLowerCase() === "installer" &&
      !!firebaseUser,
    firebaseUser: firebaseUser ?? null,
    intervalMs: 20000,
  });

  useEffect(() => {
    console.log("[TRACK] running:", tracking.running);
    console.log("[TRACK] lastPingAt:", tracking.lastPingAt);
    console.log("[TRACK] error:", tracking.error);
    console.log("[TRACK] lastStatus:", tracking.lastStatus);
  }, [tracking.running, tracking.lastPingAt, tracking.error, tracking.lastStatus]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-full max-w-sm p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-background min-h-screen">
        <div className="max-w-md mx-auto border-x bg-card min-h-screen">
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sticky top-0 z-10">
              <TabsTrigger value="tasks">
                <ListTodo className="mr-2 h-4 w-4" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="history" asChild>
                <Link href="/mobile/completed">
                  <History className="mr-2 h-4 w-4" />
                  History
                </Link>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="min-h-screen">
              <MobileView />

              {/* ✅ silent compliance line */}
              <p className="px-4 pb-6 text-xs text-muted-foreground text-center">
                Location data may be used to optimize task assignment and service
                quality.
              </p>

              {/* ✅ optional: tiny debug (remove later) */}
              {tracking.error && (
                <p className="px-4 pb-4 text-xs text-red-500 text-center">
                  Tracking error: {tracking.error}
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {user && (
        <WelcomeDialog
          user={user}
          isOpen={showWelcome}
          onClose={() => setShowWelcome(false)}
        />
      )}
    </>
  );
}
