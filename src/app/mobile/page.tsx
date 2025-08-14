
"use client";

import { MobileView } from "@/components/features/installer/MobileView";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeDialog } from "@/components/features/user-management/WelcomeDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarCheck, ListTodo, History } from "lucide-react";
import { InstallerVisitsList } from "@/components/features/installer/InstallerVisitsList";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MobilePage() {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Show welcome message on login.
    if (!loading && user) {
      const hasSeenWelcome = sessionStorage.getItem('hasSeenWelcome');
        if (!hasSeenWelcome) {
            setShowWelcome(true);
            sessionStorage.setItem('hasSeenWelcome', 'true');
        }
    }
  }, [user, loading]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
    if (!loading && role && role !== 'installer') {
        router.push('/dashboard');
    }
  }, [user, loading, role, router]);

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
            <TabsList className="grid w-full grid-cols-3 sticky top-0 z-10">
              <TabsTrigger value="tasks"><ListTodo className="mr-2 h-4 w-4"/>Tasks</TabsTrigger>
              <TabsTrigger value="visits"><CalendarCheck className="mr-2 h-4 w-4"/>Visits</TabsTrigger>
               <TabsTrigger value="history" asChild>
                  <Link href="/mobile/completed">
                    <History className="mr-2 h-4 w-4"/>History
                  </Link>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="tasks">
               <MobileView />
            </TabsContent>
            <TabsContent value="visits">
                <InstallerVisitsList installerId={user.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {user && <WelcomeDialog user={user} isOpen={showWelcome} onClose={() => setShowWelcome(false)} />}
    </>
  );
}
