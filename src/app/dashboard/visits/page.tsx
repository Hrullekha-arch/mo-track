

      "use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { collection, onSnapshot, query, doc, getDoc, collectionGroup, runTransaction, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal, User, SlotId, SlotSelection, InstallerTracking } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { AssignInstallerDialog, SLOT_OPTIONS } from "@/components/features/order-management/AssignInstallerDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eye, Plus, User as UserIcon, Calendar, ChevronDown, Share2, Copy, PlayCircle, MapPin, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getAuth } from "firebase/auth";


    interface EnrichedDealVisit extends DealVisit {
        customerName: string;
        dealName: string;
        dealDocId: string;
        customerId: string;
        customerAddress?: string;
        customer?: Customer | null;
    }
    type JobSuggestion = {
    installerId: string;
    recommendedVisitId: string | null;
    recommendedDealId?: string | null;
    recommendedCustomerName?: string | null;
    distanceKm?: number | null;

    // Base ETA
    etaMin?: number | null;

    // ✅ Smart ETA
    avgDelayMin?: number | null;
    finalEtaMin?: number | null;

    computedAt?: string;
    reason?: string;

    customerId?: string | null;
    dealDocId?: string | null;
    coordsSource?: "geo" | "legacy";
    };

    type AdminDailyStats = {
    installerId: string;
    dateKey: string;
    completedToday: number;
    totalWorkMin: number;
    avgWorkMin: number;
    delayCount: number;
    updatedAt?: string;
    };


const renderVisitStatus = (visit: EnrichedDealVisit) => {
    if (visit.status === 'completed') {
        return <Badge className="mt-1 bg-green-500">Completed</Badge>;
    }
    if (visit.visitStatus === 'Working') {
        return <Badge className="mt-1 bg-blue-500 animate-pulse">Working</Badge>;
    }
    if (visit.status === 'approved') {
        return <Badge className="mt-1" variant="secondary">Assigned</Badge>;
    }
    return <Badge className="mt-1" variant="outline">{visit.status || 'Pending'}</Badge>;
    
};

const renderLiveStatus = (status?: string) => {
    const normalized = (status || "IDLE").toUpperCase();
    const styleMap: Record<string, string> = {
        WORKING: "bg-green-500",
        DRIVING: "bg-blue-500",
        IDLE: "bg-yellow-400 text-black",
    };
    const className = styleMap[normalized] || "bg-gray-400";
    return <Badge className={className}>{normalized}</Badge>;
};

const InstallerCard = ({ 
  installer, 
  visits, 
  live,
  suggestion,
  dailyStats,
  onAssign,
  onShare,
  onViewDetails
}: { 
  installer: User, 
  live?: InstallerTracking;
  suggestion?: JobSuggestion;
  visits: EnrichedDealVisit[],
  dailyStats?: AdminDailyStats;
  onAssign: (visit: EnrichedDealVisit) => void;
  onShare: (visit: EnrichedDealVisit) => void;
  onViewDetails: (visit: EnrichedDealVisit) => void;
}) => {
    // Filter out completed visits - only show active/pending visits
    const activeVisits = visits.filter(visit => visit.status !== 'completed');

    //===============Helper
    const liveStatus = live?.status || "IDLE";

    const liveBadgeClass =
        liveStatus === "WORKING"
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
            : liveStatus === "DRIVING"
            ? "bg-sky-500/15 text-sky-300 border-sky-500/25"
            : "bg-yellow-500/15 text-yellow-300 border-yellow-500/25";

    const mapsUrl =
        typeof live?.location?.latitude === "number" && typeof live?.location?.longitude === "number"
            ? `https://www.google.com/maps?q=${live.location.latitude},${live.location.longitude}`
            : null;

    const lastPingValue = live?.lastPingAt || live?.updatedAt;
    const updatedLabel = lastPingValue
        ? new Date(lastPingValue).toLocaleTimeString()
        : "N/A";

    //===============  Eta fallbacks
    const baseEta =
    typeof suggestion?.etaMin === "number" ? suggestion.etaMin : null;

    const avgDelay =
    typeof suggestion?.avgDelayMin === "number" ? suggestion.avgDelayMin : 0;

    const smartEta =
    typeof suggestion?.finalEtaMin === "number"
        ? suggestion.finalEtaMin
        : baseEta != null
        ? baseEta + avgDelay
        : null;



    return (
        <Collapsible defaultOpen={false}>
            <Card>
                <CollapsibleTrigger asChild>
                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50">
                    <span className="font-semibold">
                    {smartEta != null ? `${smartEta} min` : "—"}
                    </span>

                    <div className="flex flex-col gap-4 w-full">
                        {/* Header Row: Avatar, Name, Email, Status Badges */}
                        <div className="flex items-center justify-between gap-4 w-full">
                            {/* Left: Avatar + Info */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage 
                                src={installer.avatarUrl || `https://ui-avatars.com/api/?name=${installer.name}`} 
                                />
                                <AvatarFallback>{installer.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            
                            <div className="min-w-0 flex-1">
                                <CardTitle className="truncate">{installer.name}</CardTitle>
                                <CardDescription className="truncate text-sm">
                                {installer.email}
                                </CardDescription>
                            </div>
                            </div>

                            {/* Right: Status Badges */}
                            <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={activeVisits.length > 0 ? "default" : "secondary"}>
                                {activeVisits.length} Active
                            </Badge>

                            <Badge className={`border ${liveBadgeClass}`}>
                                {liveStatus}
                            </Badge>
                            </div>
                        </div>

                        {/* Suggestion Row */}
                        <div className="flex items-center justify-between gap-2 w-full flex-wrap sm:flex-nowrap">
                            {/* Suggestion Badge */}
                            <div className="flex-1 min-w-0">
                            {suggestion?.recommendedVisitId ? (
                                <Badge variant="secondary" className="bg-white/10 border-white/10">
                                    Recommended: {suggestion.recommendedDealId || suggestion.recommendedVisitId} •{" "}
                                    {suggestion.distanceKm ?? "—"} km •{" "}
                                    <span className="font-semibold">{suggestion.finalEtaMin ?? suggestion.etaMin ?? "—"} min</span>
                                    {typeof suggestion.avgDelayMin === "number" && suggestion.avgDelayMin > 0 && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                        <span className="ml-1 text-xs text-muted-foreground">
                                        (Base {suggestion.etaMin} + {suggestion.avgDelayMin})
                                        </span>
                                    </span>
                                    )}
                                </Badge>
                                ) : (
                                <Badge variant="secondary" className="bg-white/10 border-white/10">
                                    No suggestion
                                </Badge>
                                )}
                            </div>

                            {/* Refresh Button */}
                            <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            className="h-8 w-8 shrink-0"
                            onClick={async (e) => {
                            e.stopPropagation();

                            const fbUser = getAuth().currentUser;
                            if (!fbUser) return;

                            const token = await fbUser.getIdToken(true);
                            await fetch("/api/admin/suggest-nearest", {
                                method: "POST",
                                headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({}),
                            });
                            }}

                            >
                            <History className="h-4 w-4" />
                            </Button>
                            {suggestion?.customerId && suggestion?.dealDocId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    asChild
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Link href={`/dashboard/customers/${suggestion.customerId}/${suggestion.dealDocId}`}>
                                    Open
                                    </Link>
                                </Button>
                                )}
                        </div>

                        {/* Bottom Row: Speed, Map, Last Updated, Chevron */}
                        <div className="flex items-center justify-between gap-3 w-full">
                            {/* Left: Speed Badge */}
                            <div className="flex items-center gap-2">
                            {typeof live?.speedKmh === "number" && (
                                <Badge variant="secondary" className="bg-white/10 border-white/10">
                                {Math.round(live.speedKmh)} km/h
                                </Badge>
                            )}
                            </div>

                            {/* Right: Map Button, Last Updated, Chevron */}
                            <div className="flex items-center gap-2 shrink-0">
                            {/* Map Button */}
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                disabled={!mapsUrl}
                                asChild
                                onClick={(e) => e.stopPropagation()}
                            >
                                <a 
                                href={mapsUrl || "#"} 
                                target="_blank" 
                                rel="noreferrer"
                                className="flex items-center justify-center"
                                >
                                <MapPin className="h-4 w-4" />
                                </a>
                            </Button>

                            {/* Last Updated */}
                            <span className="text-[11px] text-muted-foreground hidden md:inline whitespace-nowrap">
                                {updatedLabel}
                            </span>

                            {/* Chevron */}
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col">
                            {dailyStats && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="bg-white/10 border-white/10">
                                Avg Work: {dailyStats.avgWorkMin}m
                                </Badge>
                                <Badge variant="secondary" className="bg-white/10 border-white/10">
                                 Delays: {dailyStats.delayCount}
                                </Badge>
                             </div>
                             )}
                             <Button
                                variant="outline"
                                onClick={async (e) => {
                                     e.stopPropagation();
                                    const fbUser = getAuth().currentUser;
                                    if (!fbUser) return;
                                    const token = await fbUser.getIdToken(true);
                                    await fetch("/api/admin/daily-stats", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({}),
                                    });
                                }}
                                >
                                Refresh Stats
                                </Button>

                            </div>
                        </div>
                        </div>

                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                         <div className="space-y-3">
                            {activeVisits.length > 0 ? (
                                activeVisits.map(visit => (
                                    <Card 
                                        key={visit.id} 
                                        className={cn(
                                            "hover:shadow-md transition-shadow",
                                            (visit.visitStatus === "Working" || (live?.currentVisitId && live.currentVisitId === visit.id)) && "ring-2 ring-blue-500"

                                        )}
                                    >
                                        <CardContent className="p-4">
                                            {/* First Row: Customer Name and Status */}
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-lg">{visit.customerName}</h3>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {visit.slotLabel || 'No Slot'}
                                                    </Badge>
                                                    {renderVisitStatus(visit)}
                                                </div>
                                            </div>

                                            {/* Second Row: Deal ID and Re-assign Button */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Link 
                                                        href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`} 
                                                        className="text-primary hover:underline font-medium"
                                                    >
                                                        {visit.dealId}
                                                    </Link>
                                                    {visit.dueDate && (
                                                        <span className="text-xs text-muted-foreground">
                                                            • {format(new Date(visit.dueDate), 'PPP')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => onViewDetails(visit)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        onClick={() => onAssign(visit)}
                                                    >
                                                        Re-Assign
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => onShare(visit)}
                                                    >
                                                        <Share2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Optional: Address if available */}
                                            {visit.customerAddress && (
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    📍 {visit.customerAddress}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <Card>
                                    <CardContent className="p-8 text-center">
                                        <p className="text-muted-foreground">No active visits assigned.</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}


function AllVisitsTable({ visits, assigneeNameById, onAssign, onShare, onViewDetails }: { visits: EnrichedDealVisit[], assigneeNameById: Record<string, string>, onAssign: (visit: EnrichedDealVisit) => void, onShare: (visit: EnrichedDealVisit) => void, onViewDetails: (visit: EnrichedDealVisit) => void }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>All Visits List</CardTitle>
                <CardDescription>A comprehensive list of all scheduled visits.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Deal ID</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Date & Slot</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created By</TableHead>
                            <TableHead>Assign</TableHead>
                            <TableHead>View</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visits.map(visit => (
                            <TableRow key={visit.id} className={cn(visit.visitStatus === 'Working' && 'ring-2 ring-blue-500 ring-offset-2')}>
                                <TableCell className="font-medium">{visit.customerName}</TableCell>
                                <TableCell>
                                    <Link href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`} className="text-primary hover:underline">
                                        {visit.dealId}
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize">{visit.typeOfVisit}</Badge>
                                </TableCell>
                                <TableCell>
                                    {visit.dueDate ? format(new Date(visit.dueDate), 'PPP') : 'Not Set'}
                                    <br />
                                    <span className="text-xs text-muted-foreground">{visit.slotLabel || 'N/A'}</span>
                                </TableCell>
                                <TableCell>
                                    {visit.assignedTo ? (assigneeNameById[visit.assignedTo] || 'Unknown') : 'Unassigned'}
                                </TableCell>
                                <TableCell>{renderVisitStatus(visit)}</TableCell>
                                <TableCell>{visit.createdBy}</TableCell>
                                <TableCell>
                                    <Button size="sm" variant="default" className="bg-blue-700" onClick={() => onAssign(visit)}>Assign</Button>
                                    {/* <Button size="sm" variant="ghost" onClick={() => onShare(visit)}><Share2 className="h-4 w-4" /></Button> */}
                                </TableCell>
                                <TableCell className="flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => onViewDetails(visit)}><Eye className="h-4 w-4" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}


export default function AllVisitsPage() {
    const [allVisits, setAllVisits] = React.useState<EnrichedDealVisit[]>([]);
    const [users, setUsers] = React.useState<User[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [tracking, setTracking] = React.useState<InstallerTracking[]>([]);
    const [trackingLoading, setTrackingLoading] = React.useState(true);
    const [selectedVisit, setSelectedVisit] = React.useState<EnrichedDealVisit | null>(null);
    const [isAssigning, setIsAssigning] = React.useState(false);
    const [shareableLink, setShareableLink] = React.useState<string | null>(null);
    const [detailsVisit, setDetailsVisit] = React.useState<EnrichedDealVisit | null>(null);
    const [dailyStatsMap, setDailyStatsMap] = React.useState<Record<string, AdminDailyStats>>({});

    const { toast } = useToast();
    
    const installers = React.useMemo(() => users.filter(u => u.role === 'installer'), [users]);
    const assigneeNameById = React.useMemo(() => {
        const map: Record<string, string> = {};
        users.forEach(user => {
            map[user.id] = user.name;
        });
        return map;
    }, [users]);

    const groupedVisits = React.useMemo(() => {
        const map = new Map<string, EnrichedDealVisit[]>();
        installers.forEach(installer => map.set(installer.id, [])); // Initialize for all installers
        allVisits.forEach(visit => {
            if (visit.assignedTo) {
                if (!map.has(visit.assignedTo)) {
                    map.set(visit.assignedTo, []);
                }
                map.get(visit.assignedTo)!.push(visit);
            }
        });
        return map;
    }, [allVisits, installers]);

    const trackingByInstaller = React.useMemo(() => {
        const map = new Map<string, InstallerTracking>();
        tracking.forEach(doc => {
            const key = doc.installerId || doc.id;
            map.set(key, { ...doc, installerId: key, id: doc.id || key });
        });
        return map;
    }, [tracking]);

    //=======Suggestion Map
    const [suggestMap, setSuggestMap] = React.useState<Record<string, JobSuggestion>>({});

        React.useEffect(() => {
        const unsub = onSnapshot(collection(db, "jobSuggestions"), (snap) => {
            const next: Record<string, JobSuggestion> = {};
            snap.forEach((d) => {
            next[d.id] = { installerId: d.id, ...(d.data() as any) };
            });
            setSuggestMap(next);
        });
        return () => unsub();
        }, []);

    //=======Daily Stats Map\
    React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "adminDailyStats"), (snap) => {
        const next: Record<string, AdminDailyStats> = {};
        snap.forEach((d) => {
        const data = d.data() as any;
        if (data?.installerId) next[data.installerId] = data;
        });
        setDailyStatsMap(next);
    });
    return () => unsub();
    }, []);    

    const visitsById = React.useMemo(() => {
        const map = new Map<string, EnrichedDealVisit>();
        allVisits.forEach(visit => map.set(visit.id, visit));
        return map;
    }, [allVisits]);

    const completedTodayByInstaller = React.useMemo(() => {
        const map = new Map<string, number>();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        allVisits.forEach(visit => {
            if (!visit.assignedTo || visit.status !== 'completed' || !visit.visitEndTime) return;
            const endTime = new Date(visit.visitEndTime);
            if (Number.isNaN(endTime.getTime()) || endTime < todayStart) return;
            map.set(visit.assignedTo, (map.get(visit.assignedTo) || 0) + 1);
        });

        return map;
    }, [allVisits]);

    React.useEffect(() => {
        setLoading(true);

        const usersQuery = query(collection(db, "users"));
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setUsers(usersData);
        });

        const visitsQuery = collectionGroup(db, 'visits');
        const unsubscribeVisits = onSnapshot(visitsQuery, async (snapshot) => {
            const customerCache = new Map<string, Customer>();
            const dealCache = new Map<string, Deal>();

            const visitsDataPromises = snapshot.docs.map(async (docSnap) => {
                const visit = docSnap.data() as DealVisit;
                const pathParts = docSnap.ref.path.split('/');
                const customerId = pathParts[1];
                const dealDocId = pathParts[3];

                let customerName = 'Unknown';
                let dealName = 'Unknown';
                let dealId = 'N/A';
                
                if (!customerCache.has(customerId)) {
                    const customerRef = doc(db, 'customers', customerId);
                    const customerSnap = await getDoc(customerRef);
                    if (customerSnap.exists()) {
                        customerCache.set(customerId, { id: customerSnap.id, ...customerSnap.data() } as Customer);
                    }
                }
                customerName = customerCache.get(customerId)?.name || 'Unknown';
                
                const dealCacheKey = `${customerId}-${dealDocId}`;
                if (!dealCache.has(dealCacheKey)) {
                     const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                     const dealSnap = await getDoc(dealRef);
                     if (dealSnap.exists()) {
                        dealCache.set(dealCacheKey, { id: dealSnap.id, ...dealSnap.data() } as Deal);
                    }
                }
                const dealData = dealCache.get(dealCacheKey);
                dealName = dealData?.dealName || 'Unknown';
                dealId = dealData?.dealId || 'N/A';

                return { ...visit, id: docSnap.id, customerId, dealDocId, customerName, dealName, dealId, customer: customerCache.get(customerId) || null };
            });
            
            const visitsData = await Promise.all(visitsDataPromises);
            setAllVisits(visitsData);
            setLoading(false);
        });

        const trackingQuery = collection(db, "installerTracking");
        const unsubscribeTracking = onSnapshot(trackingQuery, (snapshot) => {
            const trackingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstallerTracking));
            setTracking(trackingData);
            setTrackingLoading(false);
        });

        return () => {
            unsubscribeUsers();
            unsubscribeVisits();
            unsubscribeTracking();
        };
    }, []);

    const handleShareClick = (visit: EnrichedDealVisit) => {
        const baseURL = "https://mo-track-yerq.vercel.app";
        const link = `${baseURL}/visit/confirm/${visit.id}?customerId=${visit.customerId}&dealId=${visit.dealDocId}`;
        setShareableLink(link);
    };

    const handleAssignInstaller = async (installerId: string, slot?: SlotSelection) => {
        if (!selectedVisit || !slot || !slot.slotDate) return;
        setIsAssigning(false); // To close the dialog immediately

        try {
            const assignedAt = new Date().toISOString();
            const previousInstallerId = selectedVisit.assignedTo || "";
            const previousSlotDate = selectedVisit.slotDate || "";

            await runTransaction(db, async (transaction) => {
                const visitRef = doc(db, "customers", selectedVisit.customerId, "deals", selectedVisit.dealDocId, "visits", selectedVisit.id);
                const newDateRef = doc(db, "installers", installerId, "dates", slot.slotDate);
                const prevRef = previousInstallerId && previousSlotDate
                    ? doc(db, "installers", previousInstallerId, "dates", previousSlotDate)
                    : null;

                const prevSnap = prevRef ? await transaction.get(prevRef) : null;
                const newSnap = await transaction.get(newDateRef);

                const prevSlots = prevSnap?.exists() && Array.isArray((prevSnap.data() as any)?.slots)
                    ? (prevSnap.data() as any).slots
                    : [];
                const cleanedPrev = prevSlots.filter((s: any) => s?.visitId !== selectedVisit.id);

                const newSlots = newSnap.exists() && Array.isArray((newSnap.data() as any)?.slots)
                    ? (newSnap.data() as any).slots
                    : [];

                const blocking = newSlots.find(
                    (s: any) => (s?.slotId || s?.id) === slot.slotId && s?.visitId && s.visitId !== selectedVisit.id
                );
                if (blocking) {
                    throw new Error(`Slot ${slot.slotLabel} already booked.`);
                }

                const filteredNew = newSlots.filter(
                    (s: any) => s && (s.slotId || s.id) !== slot.slotId && s.visitId !== selectedVisit.id
                );

                const slotPayload = {
                    slotId: slot.slotId,
                    id: slot.slotId,
                    slotLabel: slot.slotLabel,
                    slotStart: slot.slotStart,
                    slotEnd: slot.slotEnd,
                    slotDate: slot.slotDate,
                    visitId: selectedVisit.id,
                    customerId: selectedVisit.customerId,
                    customerName: selectedVisit.customerName || "",
                    dealId: selectedVisit.dealId || "",
                    dealDocId: selectedVisit.dealDocId,
                    dealName: selectedVisit.dealName || "",
                    assignedAt,
                    assignedTo: installerId,
                    status: "booked",
                };

                const slotsForDay = SLOT_OPTIONS.map((opt) => {
                    if (opt.id === slot.slotId) return slotPayload;

                    const existing = filteredNew.find((s: any) => (s?.slotId || s?.id) === opt.id);
                    if (existing) {
                        return {
                            ...existing,
                            slotId: opt.id,
                            id: opt.id,
                            slotLabel: existing.slotLabel || opt.label,
                            slotStart: existing.slotStart || opt.start,
                            slotEnd: existing.slotEnd || opt.end,
                            slotDate: slot.slotDate,
                            status: existing.status || (existing.visitId ? "booked" : "free"),
                        };
                    }

                    return {
                        slotId: opt.id,
                        id: opt.id,
                        slotLabel: opt.label,
                        slotStart: opt.start,
                        slotEnd: opt.end,
                        slotDate: slot.slotDate,
                        status: "free",
                    };
                });

                if (prevRef) {
                    transaction.set(
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

                transaction.set(
                    newDateRef,
                    { slotDate: slot.slotDate, slots: slotsForDay },
                    { merge: true }
                );
                
                transaction.update(visitRef, {
                    assignedTo: installerId,
                    slotDate: slot.slotDate,
                    slotId: slot.slotId,
                    slotLabel: slot.slotLabel,
                    slotStart: slot.slotStart,
                    slotEnd: slot.slotEnd,
                    assignedAt,
                });
            });

            toast({ title: "Assigned", description: "Installer and slot updated successfully." });
            setSelectedVisit(null);
        } catch (error: any) {
            console.error("Failed to assign installer:", error);
            toast({ variant: "destructive", title: "Assignment Failed", description: error?.message || "Could not save slot." });
        }
    };
    
    if (loading) {
        return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <header className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">All Visits</h1>
                    <p className="text-muted-foreground">A centralized log of all customer visits and appointments.</p>
                </div>
            </header>
            
            <Tabs defaultValue="live" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="live">Live</TabsTrigger>
                    <TabsTrigger value="installers">Installers</TabsTrigger>
                    <TabsTrigger value="all">All Visits</TabsTrigger>
                </TabsList>
                <TabsContent value="live" className="mt-4">
                    {trackingLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {installers.map(installer => {
                                const trackingDoc = trackingByInstaller.get(installer.id);
                                const currentVisit = trackingDoc?.currentVisitId
                                    ? visitsById.get(trackingDoc.currentVisitId)
                                    : null;
                                const assignedVisits = groupedVisits.get(installer.id) || [];
                                const fallbackVisit = assignedVisits.find(visit => visit.status !== 'completed') || null;
                                const activeVisit = currentVisit || fallbackVisit;
                                const taskLabel = activeVisit
                                    ? `${activeVisit.customerName} (${activeVisit.typeOfVisit})`
                                    : trackingDoc?.currentVisitId
                                        ? `Visit ${trackingDoc.currentVisitId}`
                                        : "Unassigned";
                                const completedCount = completedTodayByInstaller.get(installer.id) || 0;
                                const mapSrc = trackingDoc?.location
                                    ? `https://maps.google.com/maps?q=${trackingDoc.location.latitude},${trackingDoc.location.longitude}&z=15&output=embed`
                                    : null;
                                const lastPingDate = trackingDoc?.lastPingAt
                                    ? new Date(trackingDoc.lastPingAt)
                                    : null;
                                const lastPingAt =
                                    lastPingDate && !Number.isNaN(lastPingDate.getTime())
                                        ? format(lastPingDate, "p")
                                        : "No signal";

                                return (
                                    <Card key={installer.id}>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center justify-between">
                                                <span>{installer.name}</span>
                                                {renderLiveStatus(trackingDoc?.status)}
                                            </CardTitle>
                                            <CardDescription>Last ping: {lastPingAt}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-3 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Current task</span>
                                                <span className="font-medium">{taskLabel}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Completed today</span>
                                                <span className="font-semibold">{completedCount}</span>
                                            </div>
                                        
                                            {mapSrc ? (
                                                <div className="overflow-hidden rounded-md border">
                                                    <iframe
                                                        title={`${installer.name} location`}
                                                        src={mapSrc}
                                                        className="h-40 w-full"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="rounded-md border px-3 py-4 text-xs text-muted-foreground text-center">
                                                    No live location yet.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="installers" className="mt-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-4">
                        {installers.map(installer => (
                            <InstallerCard
                                key={installer.id}
                                installer={installer}
                                live={trackingByInstaller.get(installer.id)}
                                suggestion={suggestMap[installer.id]}
                                visits={groupedVisits.get(installer.id) || []}
                                onAssign={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                                onShare={handleShareClick}
                                onViewDetails={(visit) => setDetailsVisit(visit)}
                            />
                        ))}
                    </div>
                </TabsContent>
                <TabsContent value="all" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-4">
                        {installers.map(installer => (
                            <InstallerCard
                                key={installer.id}
                                installer={installer}
                                live={trackingByInstaller.get(installer.id)}
                                suggestion={suggestMap[installer.id]}
                                dailyStats={dailyStatsMap[installer.id]}
                                visits={groupedVisits.get(installer.id) || []}
                                onAssign={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                                onShare={handleShareClick}
                                onViewDetails={(visit) => setDetailsVisit(visit)}
                            />
                        ))}
                    </div>
                    <div>
                        <AllVisitsTable
                            visits={allVisits}
                            assigneeNameById={assigneeNameById}
                            onAssign={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                            onShare={handleShareClick}
                            onViewDetails={(visit) => setDetailsVisit(visit)}
                        />
                    </div>
                </TabsContent>
            </Tabs>
            
            <Dialog open={!!detailsVisit} onOpenChange={() => setDetailsVisit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Visit Details</DialogTitle>
                    </DialogHeader>
                    {detailsVisit && (
                        <div className="py-4 space-y-4">
                            <p><strong>Type:</strong> <Badge variant="outline" className="capitalize">{detailsVisit.typeOfVisit}</Badge></p>
                            {detailsVisit.typeOfVisit === 'measurement' ? (
                                <div className="space-y-2">
                                    <h4 className="font-semibold">Measurement Details:</h4>
                                    <p>Measurements: {detailsVisit.measurements?.join(', ') || 'N/A'}</p>
                                    {detailsVisit.blinds && <p>Blinds: {detailsVisit.blinds.join(', ')}</p>}
                                </div>
                            ) : (
                                 <div className="space-y-2">
                                    <h4 className="font-semibold">Delivery/Installation Details:</h4>
                                     <p>Items: {detailsVisit.deliveryInstallations?.map(d => `${d?.id} (x${d?.noOfPcs || 1})`).join(', ') || 'N/A'}</p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <AssignInstallerDialog
                isOpen={isAssigning}
                onClose={() => setIsAssigning(false)}
                onAssign={handleAssignInstaller}
                installers={installers}
                currentInstallerId={selectedVisit?.assignedTo}
                currentVisitId={selectedVisit?.id}
                currentSlotSelection={selectedVisit ? { 
                    slotDate: selectedVisit.slotDate, 
                    slotId: selectedVisit.slotId as SlotId, 
                    slotLabel: selectedVisit.slotLabel,
                    slotStart: selectedVisit.slotStart,
                    slotEnd: selectedVisit.slotEnd,
                } : undefined}
            />

            <Dialog open={!!shareableLink} onOpenChange={() => setShareableLink(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Share Confirmation Link</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input value={shareableLink || ""} readOnly />
                    </div>
                    <DialogFooter>
                        <Button onClick={() => { navigator.clipboard.writeText(shareableLink || ""); toast({title: "Link Copied!"}); }}>
                            <Copy className="mr-2 h-4 w-4"/> Copy Link
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


    
