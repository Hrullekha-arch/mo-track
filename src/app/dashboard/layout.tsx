
"use client";

import { AppShell } from "@/components/shared/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WelcomeDialog } from "@/components/features/user-management/WelcomeDialog";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Check session storage to see if we've already shown the welcome message
    const hasBeenWelcomed = sessionStorage.getItem('hasBeenWelcomed');
    if (!loading && user && !hasBeenWelcomed) {
      setShowWelcome(true);
      sessionStorage.setItem('hasBeenWelcomed', 'true');
    }
  }, [user, loading]);


  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
    if (!loading && user && role === 'installer') {
        router.push('/mobile');
    }
  }, [user, loading, router, role]);

  if (loading || !user || role === 'installer') {
    return (
      <div className="flex items-center justify-center h-screen">
         <div className="flex items-center space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
            </div>
        </div>
      </div>
    );
  }

  // The check for user is done above, so we can safely render the shell and dialog
  return (
    <>
      <AppShell>{children}</AppShell>
      <WelcomeDialog user={user} isOpen={showWelcome} onClose={() => setShowWelcome(false)} />
    </>
  );
}
