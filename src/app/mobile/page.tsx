
"use client";

import { MobileView } from "@/components/features/installer/MobileView";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeDialog } from "@/components/features/user-management/WelcomeDialog";

export default function MobilePage() {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Show welcome message on login.
    if (!loading && user) {
      setShowWelcome(true);
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
          <MobileView />
        </div>
      </div>
      {user && <WelcomeDialog user={user} isOpen={showWelcome} onClose={() => setShowWelcome(false)} />}
    </>
  );
}

    
