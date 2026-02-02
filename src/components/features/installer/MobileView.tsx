"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Phone, MapPin, Loader2, AlertTriangle, Star, CheckCheck, RefreshCw, Milestone, CalendarCheck, ArrowRight, Truck, UserIcon, UserCircle, Dock, CalendarSync, PlayCircle, HistoryIcon, Clock } from "lucide-react";
import { Order, Milestone, DealVisit, User, Customer, Deal, O2DStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useMemo, useCallback } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch, getDocs, limit, collectionGroup, getDoc, arrayUnion, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const formatDetailEntry = (entry: any): string | null => {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === "string" || typeof entry === "number") {
    const text = String(entry).trim();
    return text ? text : null;
  }
  if (typeof entry === "object") {
    const label = entry.label ?? entry.name ?? entry.type ?? entry.title ?? entry.id;
    const qty = entry.noOfPcs ?? entry.qty ?? entry.quantity ?? entry.count;
    if (label && qty !== undefined && qty !== null && String(qty).trim() !== "") {
      return `${label} x${qty}`;
    }
    if (label) return String(label);
    return null;
  }
  return null;
};

const collectDetailEntries = (value: any): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map(formatDetailEntry).filter(Boolean) as string[];
  }
  const single = formatDetailEntry(value);
  return single ? [single] : [];
};
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignInstallerDialog, SLOT_OPTIONS, type SlotSelection } from "../order-management/AssignInstallerDialog";
import { startVisitAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

const LOCATION_PING_INTERVAL_MS = 20000;

type InstallerTask = 
    | { type: 'order'; data: Order }
    | { type: 'visit'; data: EnrichedInstallerVisit };

interface EnrichedInstallerVisit extends DealVisit {
    customer: Customer | null;
    deal: Deal | null;
    dealDocId: string;
    customerId: string;
}

export function MobileView() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<InstallerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [repNameMap, setRepNameMap] = useState<Record<string, string>>({});
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferVisit, setTransferVisit] = useState<EnrichedInstallerVisit | null>(null);
  const [geoPermission, setGeoPermission] = useState<PermissionState | "unsupported">("prompt");
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);


  const requestLocationNow = useCallback(async () => {
  if (!navigator.geolocation) {
    setLocationError("Geolocation is not supported by this browser.");
    setGeoPermission("unsupported");
    return;
  }

  setIsRequestingLocation(true);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationError(null);
      setGeoPermission("granted");
      setIsRequestingLocation(false);

      // optional: send ping immediately
      void fetch("/api/tracking/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installerId: user?.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          timestamp: position.coords.timestamp,
        }),
      }).catch(() => {});
    },
    (error) => {
      setLocationError(error.message);
      // If user blocks, browser will usually return denied next
      setIsRequestingLocation(false);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}, [user?.id]);



  useEffect(() => {
  if (!user) return;
  if (!navigator.geolocation) {
    setLocationError("Geolocation is not supported by this browser.");
    return;
  }

  let active = true;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const requestPosition = () => {
    // If denied, do NOT spam calls. Show button UX instead.
    if (geoPermission === "denied") return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationError(null);

        void fetch("/api/tracking/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installerId: user.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            timestamp: position.coords.timestamp,
          }),
        }).catch(() => {});
      },
      (error) => {
        if (!active) return;
        setLocationError(error.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
  };

  requestPosition();
  intervalId = setInterval(requestPosition, LOCATION_PING_INTERVAL_MS);

  return () => {
    active = false;
    if (intervalId) clearInterval(intervalId);
  };
}, [user, geoPermission]);


  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const ordersQuery = query(collection(db, "orders"), where("assignedTo", "==", user.id));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setTasks(prevTasks => {
            const otherTasks = prevTasks.filter(t => t.type !== 'order');
            const newOrderTasks: InstallerTask[] = ordersData.map(o => ({ type: 'order', data: o }));
            return [...otherTasks, ...newOrderTasks];
        });
        setLoading(false);
    });

    const visitsQuery = query(
        collectionGroup(db, "visits"),
        where("assignedTo", "==", user.id),
        where("status", "!=", "completed")
    );
     const unsubscribeVisits = onSnapshot(visitsQuery, async (snapshot) => {
        const customerCache = new Map<string, Customer>();
        const dealCache = new Map<string, Deal>();

        const visitsDataPromises = snapshot.docs.map(async (docSnap) => {
            const visit = docSnap.data() as DealVisit;
            const pathParts = docSnap.ref.path.split('/');
            const customerId = pathParts[1];
            const dealDocId = pathParts[3];

            let customerData: Customer | null = customerCache.get(customerId) || null;
            if (!customerData) {
                const customerRef = doc(db, 'customers', customerId);
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                    customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;
                    customerCache.set(customerId, customerData);
                }
            }

            const dealCacheKey = `${customerId}-${dealDocId}`;
            let dealData: Deal | null = dealCache.get(dealCacheKey) || null;
            if (!dealData) {
                    const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                    const dealSnap = await getDoc(dealRef);
                     if (dealSnap.exists()) {
                        dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
                        dealCache.set(dealCacheKey, dealData);
                    }
            }

            return {
                ...visit,
                id: docSnap.id,
                customer: customerData,
                deal: dealData,
                dealDocId: dealDocId,
                customerId: customerId,
            } as EnrichedInstallerVisit;
        });

        const visitsData = await Promise.all(visitsDataPromises);
        setTasks(prevTasks => {
            const otherTasks = prevTasks.filter(t => t.type !== 'visit');
            const newVisitTasks: InstallerTask[] = visitsData.map(v => ({ type: 'visit', data: v }));
            return [...otherTasks, ...newVisitTasks];
        });
        setLoading(false);
    });

    return () => {
        unsubscribeOrders();
        unsubscribeVisits();
    };
  }, [user]);

  const activeTasks = useMemo(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (date?: string | Date) => {
    if (!date) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  return tasks
    .filter(task => {
      // ---------- DATE FILTER (TODAY ONLY) ----------
      const taskDate =
        task.type === "order"
          ? task.data.createdat
          : task.data.dueDate;

      if (!isToday(taskDate)) return false;

      // ---------- STATUS FILTER ----------
      if (task.type === "order") {
        const isCompleted =
          task.data.milestones.every(m => m.completed) &&
          (!!task.data.feedbackRating || task.data.bypassedOtp === true);

        return !isCompleted;
      }

      if (task.type === "visit") {
        return (
          task.data.status !== "completed" &&
          task.data.status !== "CWC"
        );
      }

      return false;
    })
    .sort((a, b) => {
  // ---------- VISIT vs VISIT ----------
  if (a.type === "visit" && b.type === "visit") {
    const aTime = a.data.slotDate
      ? new Date(`${a.data.slotDate} ${a.data.slotStart || "00:00"}`).getTime()
      : Number.MAX_SAFE_INTEGER;

    const bTime = b.data.slotDate
      ? new Date(`${b.data.slotDate} ${b.data.slotStart || "00:00"}`).getTime()
      : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;
  }

  // ---------- VISIT BEFORE ORDER ----------
  if (a.type === "visit" && b.type === "order") return -1;
  if (a.type === "order" && b.type === "visit") return 1;

  // ---------- ORDER vs ORDER ----------
  const aCreated = new Date(a.data.createdAt || 0).getTime();
  const bCreated = new Date(b.data.createdAt || 0).getTime();

  return aCreated - bCreated;
});

}, [tasks]);



  async function fetchUserNames(ids: string[]) {
    const res = await fetch("/api/users/names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return res.json();
  }

  useEffect(() => {
    const visitTasks = tasks.filter((t) => t.type === "visit") as { type: "visit"; data: EnrichedInstallerVisit }[];

    const ids = Array.from(
      new Set(
        visitTasks
          .flatMap((t) => [t.data.representative, t.data.assignedTo])
          .filter(Boolean) as string[]
      )
    );

    const missing = ids.filter((id) => !repNameMap[id]);
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      const json = await fetchUserNames(missing);
      if (cancelled) return;

      if (json?.success && json?.map) {
        setRepNameMap((prev) => ({ ...prev, ...json.map }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasks, repNameMap]);

  const handleTransferVisit = async (visit: EnrichedInstallerVisit, slots?: SlotSelection[]) => {
    if (!user?.id || !slots || slots.length === 0) return;

    const installerId = user.id;
    const assignedAt = new Date().toISOString();
    const slotDate = slots[0].slotDate;
    const slotIndex = new Map(SLOT_OPTIONS.map((opt, idx) => [opt.id, idx]));
    const uniqueSlotIds = Array.from(new Set(slots.map((s) => s.slotId)));
    const sortedSlotIds = uniqueSlotIds.sort(
      (a, b) => (slotIndex.get(a) ?? 0) - (slotIndex.get(b) ?? 0)
    );
    const firstSlot = SLOT_OPTIONS.find((s) => s.id === sortedSlotIds[0]);
    const lastSlot = SLOT_OPTIONS.find((s) => s.id === sortedSlotIds[sortedSlotIds.length - 1]);
    if (!firstSlot || !lastSlot) return;

    const combinedLabel = `${firstSlot.start} - ${lastSlot.end}`;

    const visitRef = doc(
      db,
      "customers",
      visit.customerId,
      "deals",
      visit.dealDocId,
      "visits",
      visit.id
    );

    const newDateRef = doc(db, "installers", installerId, "dates", slotDate);

    const previousInstallerId = visit.assignedTo || installerId;
    const previousSlotDate = visit.slotDate || "";
    const previousSlotIds = visit.slotIds?.length
      ? visit.slotIds
      : visit.slotId
        ? [visit.slotId]
        : [];
    const previousSorted = [...previousSlotIds].sort(
      (a, b) => (slotIndex.get(a) ?? 0) - (slotIndex.get(b) ?? 0)
    );

    const selectionUnchanged =
      previousInstallerId === installerId &&
      previousSlotDate === slotDate &&
      previousSorted.length === sortedSlotIds.length &&
      previousSorted.every((id, idx) => id === sortedSlotIds[idx]);

    if (selectionUnchanged) {
      return;
    }

    await runTransaction(db, async (tx) => {
      if (previousInstallerId && previousSlotDate) {
        const prevRef = doc(db, "installers", previousInstallerId, "dates", previousSlotDate);
        const prevSnap = await tx.get(prevRef);
        const prevSlots = prevSnap.exists() && Array.isArray((prevSnap.data() as any)?.slots)
          ? (prevSnap.data() as any).slots
          : [];

        const cleanedPrev = prevSlots.filter((s: any) => s?.visitId !== visit.id);

        tx.set(
          prevRef,
          {
            slotDate: previousSlotDate,
            slots: SLOT_OPTIONS.map((opt) => {
              const existing = cleanedPrev.find((s: any) => (s?.slotId || s?.id) === opt.id);
              if (existing) {
                return {
                  ...existing,
                  slotId: opt.id,
                  id: opt.id,
                  slotLabel: existing.slotLabel || opt.label,
                  slotStart: existing.slotStart || opt.start,
                  slotEnd: existing.slotEnd || opt.end,
                  slotDate: previousSlotDate,
                  status: existing.status || (existing.visitId ? "booked" : "free"),
                };
              }
              return {
                slotId: opt.id,
                id: opt.id,
                slotLabel: opt.label,
                slotStart: opt.start,
                slotEnd: opt.end,
                slotDate: previousSlotDate,
                status: "free",
              };
            }),
          },
          { merge: true }
        );
      }

      const newSnap = await tx.get(newDateRef);
      const newSlots = newSnap.exists() && Array.isArray((newSnap.data() as any)?.slots)
        ? (newSnap.data() as any).slots
        : [];

      const selectedSlotSet = new Set(sortedSlotIds);
      const blocking = newSlots.find(
        (s: any) => selectedSlotSet.has(s?.slotId || s?.id) && s?.visitId && s.visitId !== visit.id
      );
      if (blocking) {
        throw new Error(`Slot ${blocking.slotLabel || blocking.slotId} already booked.`);
      }

      const filteredNew = newSlots.filter((s: any) => s && s.visitId !== visit.id);

      const slotsForDay = SLOT_OPTIONS.map((opt) => {
        if (selectedSlotSet.has(opt.id)) {
          return {
            slotId: opt.id,
            id: opt.id,
            slotLabel: opt.label,
            slotStart: opt.start,
            slotEnd: opt.end,
            slotDate: slotDate,
            visitId: visit.id,
            customerId: visit.customerId,
            customerName: visit.customer?.name || "",
            dealId: visit.deal?.dealId || visit.dealId || "",
            dealDocId: visit.dealDocId,
            dealName: visit.deal?.title || visit.deal?.dealName || "",
            assignedAt,
            assignedTo: installerId,
            status: "booked",
          };
        }

        const existing = filteredNew.find((s: any) => (s?.slotId || s?.id) === opt.id);
        if (existing) {
          return {
            ...existing,
            slotId: opt.id,
            id: opt.id,
            slotLabel: existing.slotLabel || opt.label,
            slotStart: existing.slotStart || opt.start,
            slotEnd: existing.slotEnd || opt.end,
            slotDate: slotDate,
            status: existing.status || (existing.visitId ? "booked" : "free"),
          };
        }

        return {
          slotId: opt.id,
          id: opt.id,
          slotLabel: opt.label,
          slotStart: opt.start,
          slotEnd: opt.end,
          slotDate: slotDate,
          status: "free",
        };
      });

      tx.set(
        newDateRef,
        { slotDate: slotDate, slots: slotsForDay },
        { merge: true }
      );

      tx.update(visitRef, {
        assignedTo: installerId,
        slotDate: slotDate,
        slotId: firstSlot.id,
        slotIds: sortedSlotIds,
        slotLabel: combinedLabel,
        slotStart: firstSlot.start,
        slotEnd: lastSlot.end,
        assignedAt,
        assignment: {
          assignedTo: { id: installerId },
          assignedAt,
          slot: {
            date: slotDate,
            timeFrom: firstSlot.start,
            timeTo: lastSlot.end,
          },
        },
        updatedAt: assignedAt,
      });
    });
  };

//======================Cwc Handler =======================
  const handleCwcVisit = async (visit: EnrichedInstallerVisit) => {
      if (!user?.id) return;

      const visitRef = doc(
          db,
          "customers",
          visit.customerId,
          "deals",
          visit.dealDocId,
          "visits",
          visit.id
      );

      try {
          await runTransaction(db, async (tx) => {
              tx.update(visitRef, {
                  status: 'CWC',
                  updatedAt: new Date().toISOString(),
                  updatedBy: user.id
              });
          });

          toast({
              title: "Visit Marked as CWC",
              description: `Visit for ${visit.customer?.name} has been marked as CWC successfully.`,
          });
      } catch (error) {
          console.error("Error updating visit status:", error);
          toast({
              variant: "destructive",
              title: "Failed to Mark as CWC",
              description: "Could not update the visit status. Please try again.",
          });
      }
  };

  if (loading) {
    return (
        <div className="p-4 space-y-6">
            <header className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Avatar><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
                    <div><p className="font-semibold">{user?.name}</p><p className="text-xs text-muted-foreground">Installer</p></div>
                 </div>
                 <Button variant="ghost" size="icon" disabled><LogOut className="h-5 w-5" /></Button>
            </header>
            <div className="text-center p-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground mt-4">Loading tasks...</p>
            </div>
        </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
            <AvatarFallback>{user?.name?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user?.name}</p>
            <p className="text-xs text-muted-foreground">Installer</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold">Your Tasks</h1>
            <p className="text-muted-foreground">Here are your active assignments.</p>
        </div>
      </div>

       {locationError && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Location Access Warning</AlertTitle>
            <AlertDescription>
                {locationError}. Location data will not be saved.
            </AlertDescription>
        </Alert>
      )}

      {activeTasks.length > 0 ? (
        <div className="space-y-4">
          {activeTasks.map((task, index) => (
             <div key={`${task.type}-${task.data.id}`} className="relative">
                 <span className="absolute -top-2 -left-2 bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                </span>
                <InstallerTaskCard 
                  task={task} 
                  location={location} 
                  repNameMap={repNameMap} 
                  onTransfer={(v) => { setTransferVisit(v); setIsTransferOpen(true); }}
                  onCwc={handleCwcVisit}
                />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-8 border-2 border-dashed rounded-lg">
          <p className="font-semibold">All clear!</p>
          <p className="text-sm text-muted-foreground">You have no active assignments.</p>
        </div>
      )}

      <AssignInstallerDialog
                isOpen={isTransferOpen}
                onClose={() => {
                    setIsTransferOpen(false);
                    setTransferVisit(null);
                }}
                installers={user ? [{ ...(user as any), role: "installer" }] : []}
                currentInstallerId={user?.id}
                currentVisitId={transferVisit?.id}
                currentSlotSelection={
                    transferVisit
                    ? {
                        slotDate: transferVisit.slotDate || transferVisit.dueDate,
                        slotId: transferVisit.slotId || undefined,
                        slotIds: transferVisit.slotIds?.length
                          ? transferVisit.slotIds
                          : transferVisit.slotId
                            ? [transferVisit.slotId]
                            : undefined,
                        slotLabel: transferVisit.slotLabel,
                        slotStart: transferVisit.slotStart,
                        slotEnd: transferVisit.slotEnd,
                        }
                    : undefined
                }
                onAssign={async (_installerId, slots) => {
                    if (!transferVisit || !slots || slots.length === 0) return;
                    try {
                    await handleTransferVisit(transferVisit, slots);
                    setIsTransferOpen(false);
                    setTransferVisit(null);
                    } catch (e: any) {
                    console.error(e);
                    }
                }}
                />
    </div>
  );
}

const InstallerTaskCard = ({
  task,
  location,
  repNameMap,
  onTransfer,
  onCwc,
}: {
  task: InstallerTask;
  location: { latitude: number; longitude: number } | null;
  repNameMap: Record<string, string>;
  onTransfer: (v: EnrichedInstallerVisit) => void;
  onCwc: (v: EnrichedInstallerVisit) => void;
}) => {
  if (task.type === "order") return <InstallerOrderCard order={task.data} location={location} />;

  if (task.type === "visit")
    return (
      <InstallerVisitCard
        visit={task.data}
        repNameMap={repNameMap}
        onTransfer={onTransfer}
        onCwc={onCwc}
      />
    );

  return null;
};

const InstallerVisitCard = ({
  visit,
  repNameMap,
  onTransfer,
  onCwc,
}: {
  visit: EnrichedInstallerVisit;
  repNameMap: Record<string, string>;
  onTransfer: (v: EnrichedInstallerVisit) => void;
  onCwc: (v: EnrichedInstallerVisit) => void;
}) => {
    const router = useRouter();
    const { toast } = useToast();

    const handleStartVisit = async () => {
        let geo;
        if (navigator.geolocation) {
            await new Promise<void>((resolve) => {
                navigator.geolocation.getCurrentPosition(
                (pos) => { geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM: 150 }; resolve(); },
                () => resolve(),
                { enableHighAccuracy: true, timeout: 8000 }
                );
            });
        }

        await startVisitAction(visit.customerId, visit.dealDocId, visit.id, geo);

        let path = '';
        if (visit.typeOfVisit === 'measurement') {
            path = `/mobile/measurement/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customerId}`;
        } else {
            path = `/mobile/delivery/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customerId}&orderId=${visit.orderId}`;
        }
        router.push(path);

        try {
            const result = await startVisitAction(visit.customerId, visit.dealDocId, visit.id);
            if (!result.success) {
                toast({
                    variant: "destructive",
                    title: "Could not log visit start",
                    description: result.message,
                });
            }
        } catch (e) {
            toast({
                variant: "destructive",
                title: "Network Error",
                description: "Could not connect to the server to log visit start.",
            });
        }
    };

    const getButtonContent = () => {
        if (visit.visitStatus === 'Working') {
            return { text: 'Continue Visit', icon: <PlayCircle className="ml-2 h-4 w-4" /> };
        }
        switch(visit.typeOfVisit) {
            case 'measurement':
                return { text: 'Start Measurement', icon: <ArrowRight className="ml-2 h-4 w-4" /> };
            case 'delivery':
            case 'fittings':
            case 'complaint':
            case 'tempo':
            case 'selection':
            case 'other':
                return { text: 'Start Visit', icon: <Truck className="ml-2 h-4 w-4" /> };
            default:
                return { text: 'Start Visit', icon: <ArrowRight className="ml-2 h-4 w-4" /> };
        }
    };

    function getDelayDuration(
            slotDate?: string,
            slotEnd?: string
            ): { delayed: boolean; label: string } {
            if (!slotDate || !slotEnd) {
                return { delayed: false, label: "" };
            }

            const endTime = new Date(`${slotDate} ${slotEnd}`);
            const now = new Date();

            if (now <= endTime) {
                return { delayed: false, label: "" };
            }

            const diffMs = now.getTime() - endTime.getTime();
            const totalMinutes = Math.floor(diffMs / 60000);

            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;

            return {
                delayed: true,
                label: `${hours.toString().padStart(2, "0")}:${minutes
                .toString()
                .padStart(2, "0")}`,
            };
            }
    const delayInfo = getDelayDuration(visit.slotDate, visit.slotEnd);

    const showDelay =
    delayInfo.delayed &&
    visit.status !== "completed" &&
    visit.visitStatus !== "Working";
            

    const buttonContent = getButtonContent();
    const phone = (visit.customer?.phone || visit.customer?.mobileNo || "").trim();
    const address = (visit.customer?.billingAddress?.line1 || visit.customer?.addressPinCode || visit.customer?.city || "").trim();
    
    console.log('Rendering InstallerVisitCard for visit:', visit);
    return (
        <Card>
            <CardHeader>
                <CardTitle className="capitalize flex justify-between">{visit.customer?.name || "Unknown Customer"} <Badge variant="secondary">Deal ID: {visit.deal?.dealId || 'N/A'}</Badge> <Badge>{visit.typeOfVisit}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                 <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4 text-muted-foreground" /> <span className="text-teal-800">{format(new Date(visit.slotDate),"dd MMM yyyy")} - {visit.slotLabel}</span></p>
                 {/* <p className="flex items-center gap-2">
                    <Phone color="blue" className="h-4 w-4 text-muted-foreground " />
                {phone ? (
                    <a 
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="font-medium text-blue-600"
                    >
                    {phone}
                    </a>
                ) : (
                    <span>N/A</span>
                )}
                </p> */}
                 <p className="flex items-center gap-2">
                <MapPin color="green" className="h-4 w-4 text-muted-foreground" />

                {address ? (
                    <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        address
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-green-600"
                    >
                    {address}
                    </a>
                ) : (
                    <span>N/A</span>
                )}
                </p>
                 <div className="flex items-center gap-2">
                  <Dock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {[
                      { label: "Remark", value: visit.remark },
                      { label: "Measurements", value: visit.measurements },
                      { label: "Delivery", value: visit.deliveryInstallations },
                      { label: "Sub Delivery", value: visit.subDeliveryInstallations },
                      { label: "Other Delivery", value: visit.otherDelivery },
                      { label: "Fitting", value: visit.fittingInstallations },
                      { label: "Sub Fitting", value: visit.subFittingInstallations },
                    ]
                      .flatMap(({ label, value }) => {
                        const entries = collectDetailEntries(value);
                        if (!entries.length) return [];
                        return [`${label}: ${entries.join(", ")}`];
                      })
                      .join(" | ") || "No details"}
                  </span>
                 </div>
                 <div className="flex justify-between items-center gap-2">
                    <Badge variant={"outline"} className="flex items-center gap-2"><UserCircle className="h-4 w-4 text-muted-foreground" />CRM: {visit.createdBy || 'N/A'}</Badge>
                    <Badge variant={"outline"} className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" />SM: {repNameMap[visit.representative] || <Skeleton className="h-6 w-28 rounded-full" />}</Badge>
                 </div>
            </CardContent>
             <CardFooter className="grid grid-cols-2 gap-2">
                <Button className="rounded-lg" onClick={handleStartVisit}>
                    {buttonContent.text}
                    {buttonContent.icon}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onTransfer(visit)}
                >
                    <CalendarSync className="mr-2 h-4 w-4" />
                    Transfer Visit
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                        >
                            <HistoryIcon className="mr-2 h-4 w-4" />
                            CwC
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Mark Visit as CwC?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to mark the visit for <strong>{visit.customer?.name}</strong> as "Customer will Call"? This will update the visit status.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onCwc(visit)}>
                                Confirm
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <p className="flex items-center gap-2 font-semibold">
                
                {showDelay && (
                    
                    <Badge variant="destructive" className="ml-2 gap-2 flex items-center">
                    <Clock className="h-4 w-4 text-white" />
                    Delayed {delayInfo.label} Hrs
                    </Badge>
                )}
                </p>
            </CardFooter>
        </Card>
    );
}

export function InstallerOrderCard({ order, location }: { order: Order; location: { latitude: number; longitude: number; } | null; }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [rating, setRating] = useState(0);
    const [remarks, setRemarks] = useState("");
    const [otp, setOtp] = useState("");
    const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);

    const installerMilestoneIds = [7, 8]; 
    const nextInstallerMilestone = order.milestones.find(m => installerMilestoneIds.includes(m.id) && !m.completed);

    const canUpdate = (milestone: Milestone) => {
        const currentIndex = order.milestones.findIndex(m => m.id === milestone.id);
        if (currentIndex === 0) return true;
        const prevMilestoneInFlow = order.milestones[currentIndex - 1];
        return prevMilestoneInFlow.completed;
    }

    const handleStatusUpdate = async (milestoneToUpdate: Milestone) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not logged in."});
            return;
        }

        if (!canUpdate(milestoneToUpdate)) {
            toast({ variant: "destructive", title: "Cannot update status", description: "A previous step must be completed first."});
            return;
        }
        setIsUpdating(true);
        try {
            const batch = writeBatch(db);
            const orderRef = doc(db, "orders", order.id);

            const updatedMilestones = order.milestones.map(m =>
                m.id === milestoneToUpdate.id ? { 
                    ...m, 
                    completed: true, 
                    completedAt: new Date().toISOString(), 
                    completedBy: user.name,
                    location: location
                } : m
            );
            batch.update(orderRef, { milestones: updatedMilestones });

            if (milestoneToUpdate.id === 8 && order.customerId && order.dealId) {
                const dealQuery = query(collection(db, 'customers', order.customerId, 'deals'), where('dealId', '==', order.dealId), limit(1));
                const dealSnapshot = await getDocs(dealQuery);

                if (!dealSnapshot.empty) {
                    const dealDocId = dealSnapshot.docs[0].id;

                    const visitQuery = query(collection(db, 'customers', order.customerId, 'deals', dealDocId, 'visits'), where('orderId', '==', order.id), limit(1));
                    const visitSnapshot = await getDocs(visitQuery);

                    if (!visitSnapshot.empty) {
                        const visitRef = visitSnapshot.docs[0].ref;
                        batch.update(visitRef, { status: 'completed', updatedAt: new Date().toISOString() });
                    }

                    const o2dQuery = query(collection(db, 'o2d'), where('dealId', '==', order.dealId));
                    const o2dSnapshot = await getDocs(o2dQuery);

                    if (!o2dSnapshot.empty) {
                         const o2dDocRef = o2dSnapshot.docs[0].ref;
                         const o2dDoneMilestone: O2DStatus = {
                            stepId: 13,
                            status: 'completed', 
                            completedAt: new Date().toISOString(), 
                            completedBy: user.name, 
                            selection: "Done", 
                            remarks: "Completed via mobile app"
                        };
                        batch.update(o2dDocRef, { milestones: arrayUnion(o2dDoneMilestone) });
                    }
                }
            }

            await batch.commit();

            toast({ title: `Order updated: ${milestoneToUpdate.name}` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Update failed", description: "Could not update order status."});
        } finally {
            setIsUpdating(false);
        }
    };

    const handleFeedbackSubmit = async () => {
        if (otp !== order.otp) {
            toast({ variant: "destructive", title: "Incorrect OTP", description: "Please enter the correct OTP."});
            return;
        }

        setIsUpdating(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                feedbackRating: rating,
                feedbackRemarks: remarks,
                bypassedOtp: false,
            });
            toast({ title: "Feedback submitted!", description: "Thank you for your input." });
            setIsOtpDialogOpen(false);
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast({ variant: "destructive", title: "Submission Failed" });
        } finally {
            setIsUpdating(false);
        }
    }

    const handleBypassOtp = async () => {
         setIsUpdating(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                feedbackRating: 0,
                feedbackRemarks: "Submitted without customer OTP.",
                bypassedOtp: true,
            });
            toast({ title: "Feedback Bypassed", description: "Order has been marked as complete without OTP." });
        } catch (error) {
            console.error("Error bypassing OTP:", error);
            toast({ variant: "destructive", title: "Bypass failed" });
        } finally {
            setIsUpdating(false);
        }
    }

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
            toast({title: "Data is up to date."});
        }, 700);
    }

    const isOrderComplete = order.milestones.every(m => m.completed);

    return (
        <Card>
            <CardHeader>
                 <div className="flex items-start justify-between">
                    <div className="flex-grow">
                        <CardTitle>{order.customerName}</CardTitle>
                        <CardDescription>ID: {order.id}</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
                <Badge className="w-fit mt-1" variant="outline">{order.orderType.replace('+', ' + ')}</Badge>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /><span>{order.customerAddress}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span>{order.customerPhone}</span></div>

                {nextInstallerMilestone && (
                     <div className="pt-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Next Step</p>
                        <p className="font-medium">{nextInstallerMilestone.name}</p>
                    </div>
                )}

                {nextInstallerMilestone && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button 
                                className="w-full mt-2" 
                                disabled={isUpdating || !canUpdate(nextInstallerMilestone)}
                            >
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Mark as &quot;{nextInstallerMilestone.name}&quot;
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will complete the milestone: <strong>{nextInstallerMilestone.name}</strong>. This action will be logged with your current location if available.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleStatusUpdate(nextInstallerMilestone)} disabled={isUpdating}>
                                    Continue
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {!nextInstallerMilestone && !isOrderComplete && (
                    <p className="text-sm text-muted-foreground text-center pt-4">Waiting for other departments to complete their tasks.</p>
                 )}

                {isOrderComplete && !order.feedbackRating && !order.bypassedOtp && (
                    <Dialog open={isOtpDialogOpen} onOpenChange={setIsOtpDialogOpen}>
                        <div className="pt-4 space-y-4">
                            <p className="font-semibold text-center">Order complete. Please provide feedback.</p>
                            <div className="space-y-2">
                                <Label>Rating</Label>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(star => (
                                        <button key={star} type="button" onClick={() => setRating(star)}>
                                            <Star className={cn("h-8 w-8", rating >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                        </button>
                                    ))}
                                </div>
                            </div>
                             <div className="space-y-2">
                                 <Label htmlFor={`remarks-${order.id}`}>Remarks</Label>
                                 <Textarea id={`remarks-${order.id}`} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add any comments..."/>
                             </div>
                             <div className="flex flex-col gap-2">
                                <DialogTrigger asChild>
                                    <Button className="w-full" disabled={rating === 0}>
                                        Submit Feedback
                                    </Button>
                                </DialogTrigger>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                         <Button variant="link" size="sm" className="text-muted-foreground" disabled={isUpdating}>
                                            Submit without OTP
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will mark the order as complete without customer OTP. A zero-star rating will be recorded. Use this only if the customer is unavailable.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleBypassOtp} disabled={isUpdating}>
                                                Continue
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                         <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Enter OTP</DialogTitle>
                                <DialogDescription>
                                    Please enter the 4-digit OTP provided to the customer to confirm feedback submission.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Input 
                                    type="tel" 
                                    maxLength={4} 
                                    placeholder="_ _ _ _" 
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    className="text-center text-2xl tracking-[1em]"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsOtpDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleFeedbackSubmit} disabled={isUpdating || otp.length !== 4}>
                                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirm
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {isOrderComplete && (order.feedbackRating || order.bypassedOtp) && (
                    <div className="pt-4 space-y-2">
                        <p className="font-semibold">Feedback Submitted</p>
                        {order.bypassedOtp ? (
                             <p className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">&quot;Submitted without customer OTP.&quot;</p>
                        ) : (
                            <>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(star => (
                                        <Star key={star} className={cn("h-5 w-5", order.feedbackRating! >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                    ))}
                                </div>
                                {order.feedbackRemarks && <p className="text-xs text-muted-foreground mt-1 p-1.5 border rounded-md bg-muted/50">&quot;{order.feedbackRemarks}&quot;</p>}
                           </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
