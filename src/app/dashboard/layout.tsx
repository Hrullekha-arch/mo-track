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
  const isActiveUser = user?.isActive !== false;

  useEffect(() => {
    // Show welcome message on login.
    if (!loading && user && user.isActive !== false) {
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

  if (!isActiveUser) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Account Inactive</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This account is inactive and has no dashboard modules available.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  // The check for user is done above, so we can safely render the shell and dialog
  return (
    <>
      <AppShell>{children}</AppShell>
      {user && <WelcomeDialog user={user} isOpen={showWelcome} onClose={() => setShowWelcome(false)} />}
    </>
  );
}
