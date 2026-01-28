
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
import { Eye, Plus, User as UserIcon, Calendar, ChevronDown, Share2, Copy, PlayCircle, MapPin, History, CalendarSync, MoreHorizontal, UserCheck, Edit, UserX, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { unassignVisitAction, updateVisitDetailsAction } from "./actions";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";


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
        return <Badge className="mt-1" variant="secondary">Approved</Badge>;
    }
    if (visit.status === 'CWC') {
        return <Badge className="mt-1 bg-amber-700 text-gray-800" variant="secondary">Customer will Call</Badge>;
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
          const { user, logout } = useAuth();
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

    //=================Handle Transfer Visit ===================
      const handleTransferVisit = async (visit: EnrichedDealVisit, slot: SlotSelection) => {
        if (!user?.id) return;
    
        const installerId = user.id;
        const assignedAt = new Date().toISOString();
    
        const visitRef = doc(
          db,
          "customers",
          visit.customerId,
          "deals",
          visit.dealDocId,
          "visits",
          visit.id
        );
    
        const newDateRef = doc(db, "installers", installerId, "dates", slot.slotDate);
    
        const previousInstallerId = visit.assignedTo || installerId;
        const previousSlotDate = visit.slotDate || "";
        const previousSlotId = (visit.slotId || "") as SlotId | "";
    
        if (
          previousInstallerId === installerId &&
          previousSlotDate === slot.slotDate &&
          previousSlotId === slot.slotId
        ) {
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
    
          const blocking = newSlots.find(
            (s: any) => (s?.slotId || s?.id) === slot.slotId && s?.visitId && s.visitId !== visit.id
          );
          if (blocking) {
            throw new Error(`Slot ${slot.slotLabel} already booked.`);
          }
    
          const filteredNew = newSlots.filter(
            (s: any) => s && (s.slotId || s.id) !== slot.slotId && s.visitId !== visit.id
          );
    
          const slotsForDay = SLOT_OPTIONS.map((opt) => {
            if (opt.id === slot.slotId) return {
              slotId: slot.slotId,
              id: slot.slotId,
              slotLabel: slot.slotLabel,
              slotStart: slot.slotStart,
              slotEnd: slot.slotEnd,
              slotDate: slot.slotDate,
              visitId: visit.id,
              customerId: visit.customerId,
              customerName: visit.customer?.name || "",
              dealId: visit.deal?.dealId || visit.dealId || "",
              dealDocId: visit.dealDocId,
              dealName: visit.deal?.dealName || "",
              assignedAt,
              assignedTo: installerId,
              status: "booked",
            };
    
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
    
          tx.set(
            newDateRef,
            { slotDate: slot.slotDate, slots: slotsForDay },
            { merge: true }
          );
    
          tx.update(visitRef, {
            assignedTo: installerId,
            slotDate: slot.slotDate,
            slotId: firstSlot.id,
            slotIds: sortedSlotIds,
            slotLabel: combinedLabel,
            slotStart: firstSlot.start,
            slotEnd: lastSlot.end,
            assignedAt,
          });
        });
      };    



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


function AllVisitsTable({ visits, assigneeNameById, onAssign,onShare, onViewDetails, onTransfer, onUnassign, onEdit }: { 
    visits: EnrichedDealVisit[], 
    assigneeNameById: Record<string, string>, 
    onAssign: (visit: EnrichedDealVisit) => void, 
    onShare: (visit: EnrichedDealVisit) => void, 
    onViewDetails: (visit: EnrichedDealVisit) => void, 
    onTransfer: (v: EnrichedDealVisit) => void,
    onUnassign: (v: EnrichedDealVisit) => void,
    onEdit: (v: EnrichedDealVisit) => void
}) {
    const [dateFrom, setDateFrom] = React.useState<string>("");
    const [dateTo, setDateTo] = React.useState<string>("");
    const [typeFilter, setTypeFilter] = React.useState<string>("all");
    const [statusFilter, setStatusFilter] = React.useState<string>("all");
    const [query, setQuery] = React.useState<string>("");

    const typeOptions = React.useMemo(() => {
        const set = new Set<string>();
        visits.forEach(v => {
            if (v.typeOfVisit) set.add(v.typeOfVisit);
        });
        return Array.from(set).sort();
    }, [visits]);

    const statusOptions = React.useMemo(() => {
        const set = new Set<string>();
        visits.forEach(v => {
            if (v.status) set.add(v.status);
        });
        return Array.from(set).sort();
    }, [visits]);

    const filteredVisits = React.useMemo(() => {
        const queryText = query.trim().toLowerCase();
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;
        if (toDate) {
            toDate.setHours(23, 59, 59, 999);
        }

        return visits.filter(visit => {
            if (fromDate || toDate) {
                if (!visit.dueDate) return false;
                const due = new Date(visit.dueDate);
                if (Number.isNaN(due.getTime())) return false;
                if (fromDate && due < fromDate) return false;
                if (toDate && due > toDate) return false;
            }

            if (typeFilter !== "all" && visit.typeOfVisit !== typeFilter) return false;
            if (statusFilter !== "all" && (visit.status || "requested") !== statusFilter) return false;

            if (queryText) {
                const haystack = [
                    visit.customerName,
                    visit.customerAddress,
                    visit.dealId,
                    visit.dealName,
                    visit.typeOfVisit,
                    visit.createdBy,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                if (!haystack.includes(queryText)) return false;
            }

            return true;
        });
    }, [visits, dateFrom, dateTo, typeFilter, statusFilter, query]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>All Visits List</CardTitle>
                <CardDescription>A comprehensive list of all scheduled visits.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
                    <Input
                        placeholder="Search customer / deal / address"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                    />
                    <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        {typeOptions.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>
                    <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Deal ID</TableHead>
                            <TableHead>Type / Created By</TableHead>
                            <TableHead>Date & Slot</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredVisits.map(visit => (
                            <TableRow key={visit.id} className={cn(visit.visitStatus === 'Working' && 'ring-2 ring-blue-500 ring-offset-2')}>
                                <TableCell className="font-medium">{visit.customerName}</TableCell>
                                <TableCell className="max-w-[220px] whitespace-normal break-words">
                                {visit.customer?.addressPinCode || "—"}
                                </TableCell>
                                <TableCell>
                                    <Link href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`} className="text-primary hover:underline">
                                        {visit.dealId}
                                    </Link>
                                </TableCell>
                                <TableCell className="flex flex-col gap-2">
                                    <Badge variant="outline" className="capitalize">{visit.typeOfVisit}</Badge>
                                    <Badge variant="secondary">{visit.createdBy}</Badge>
                                </TableCell>
                                <TableCell>
                                    {visit.dueDate ? format(new Date(visit.dueDate), 'PPP') : 'Not Set'}
                                    <br />
                                    <span className="text-xs text-muted-foreground">{visit.slotLabel || 'N/A'}</span>
                                </TableCell>
                                <TableCell>
                                    {visit.assignedTo ? (assigneeNameById[visit.assignedTo] || 'Unknown') : 'Unassigned'}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col items-start gap-1">
                                        {renderVisitStatus(visit)}
                                        {visit.typeOfVisit === 'measurement' && visit.status === 'completed' ? (
                                            visit.measurementPdfUrl ? (
                                                <Button variant="outline" size="sm" asChild className="h-6 text-xs px-2">
                                                    <a href={visit.measurementPdfUrl} target="_blank" rel="noopener noreferrer">
                                                        <Download className="mr-1 h-3 w-3" /> Download
                                                    </a>
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )
                                        ) : null}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => onViewDetails(visit)}>
                                                <Eye className="mr-2 h-4 w-4" />
                                                View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onAssign(visit)}>
                                                <UserCheck className="mr-2 h-4 w-4" />
                                                {visit.assignedTo ? 'Re-assign' : 'Assign'}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onEdit(visit)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Edit Visit
                                            </DropdownMenuItem>
                                            {visit.assignedTo && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => onUnassign(visit)} className="text-destructive focus:text-destructive">
                                                        <UserX className="mr-2 h-4 w-4" />
                                                        Unassign
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function EditVisitDialog({
    visit,
    isOpen,
    onClose,
    salesmen,
    onSuccess,
}: {
    visit: EnrichedDealVisit | null;
    isOpen: boolean;
    onClose: () => void;
    salesmen: User[];
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const formSchema = z.object({
        dueDate: z.string().min(1, "Due date is required."),
        representative: z.string().min(1, "Representative is required."),
        remark: z.string().optional(),
    });

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            dueDate: "",
            representative: "",
            remark: "",
        },
    });

    React.useEffect(() => {
        if (visit) {
            form.reset({
                dueDate: visit.dueDate ? format(new Date(visit.dueDate), 'yyyy-MM-dd') : "",
                representative: visit.representative || "",
                remark: visit.remark || "",
            });
        }
    }, [visit, form]);

    if (!visit) return null;

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await updateVisitDetailsAction(visit.customerId, visit.dealDocId, visit.id, {
                dueDate: new Date(values.dueDate).toISOString(),
                representative: values.representative,
                remark: values.remark,
            });

            if (result.success) {
                toast({ title: "Visit Updated", description: result.message });
                onSuccess();
                onClose();
            } else {
                toast({ variant: "destructive", title: "Update Failed", description: result.message });
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Visit</DialogTitle>
                    <DialogDescription>
                        Update details for visit to {visit.customerName}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="dueDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Due Date</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="representative"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Representative</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a representative" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {salesmen.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="remark"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Remarks</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Add any notes..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
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
    const [editingVisit, setEditingVisit] = React.useState<EnrichedDealVisit | null>(null);

    console.log("detailsVisit:", detailsVisit);

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

    const handleAssignInstaller = async (installerId: string, slots?: SlotSelection[]) => {
        if (!selectedVisit || !slots || slots.length === 0) return;
        setIsAssigning(false); // To close the dialog immediately

        try {
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
            const previousInstallerId = selectedVisit.assignedTo || "";
            const previousSlotDate = selectedVisit.slotDate || "";
            const previousSlotIds = selectedVisit.slotIds?.length
                ? selectedVisit.slotIds
                : selectedVisit.slotId
                    ? [selectedVisit.slotId]
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
                setSelectedVisit(null);
                return;
            }

            await runTransaction(db, async (tx) => {
                const visitRef = doc(db, "customers", selectedVisit.customerId, "deals", selectedVisit.dealDocId, "visits", selectedVisit.id);
                const newDateRef = doc(db, "installers", installerId, "dates", slotDate);
                const prevRef = previousInstallerId && previousSlotDate
                    ? doc(db, "installers", previousInstallerId, "dates", previousSlotDate)
                    : null;

                const prevSnap = prevRef ? await tx.get(prevRef) : null;
                const newSnap = await tx.get(newDateRef);

                const prevSlots = prevSnap?.exists() && Array.isArray((prevSnap.data() as any)?.slots)
                    ? (prevSnap.data() as any).slots
                    : [];
                const cleanedPrev = prevSlots.filter((s: any) => s?.visitId !== selectedVisit.id);

                const newSlots = newSnap.exists() && Array.isArray((newSnap.data() as any)?.slots)
                    ? (newSnap.data() as any).slots
                    : [];

                const selectedSlotSet = new Set(sortedSlotIds);
                const blocking = newSlots.find(
                    (s: any) => selectedSlotSet.has(s?.slotId || s?.id) && s?.visitId && s.visitId !== selectedVisit.id
                );
                if (blocking) {
                    throw new Error(`Slot ${blocking.slotLabel || blocking.slotId} already booked.`);
                }

                const filteredNew = newSlots.filter((s: any) => s && s.visitId !== selectedVisit.id);

                const slotsForDay = SLOT_OPTIONS.map((opt) => {
                    if (selectedSlotSet.has(opt.id)) {
                        return {
                            slotId: opt.id,
                            id: opt.id,
                            slotLabel: opt.label,
                            slotStart: opt.start,
                            slotEnd: opt.end,
                            slotDate: slotDate,
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

                if (prevRef) {
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
                });
            });

            toast({ title: "Assigned", description: "Installer and slot updated successfully." });
            setSelectedVisit(null);
        } catch (error: any) {
            console.error("Failed to assign installer:", error);
            toast({ variant: "destructive", title: "Assignment Failed", description: error?.message || "Could not save slot." });
        }
    };

    const handleUnassign = async (visit: EnrichedDealVisit) => {
        if (!visit) return;
        try {
            const result = await unassignVisitAction(visit.id, visit.customerId, visit.dealDocId);
            if (result.success) {
                toast({ title: "Visit Unassigned", description: result.message });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Server Error", description: e.message });
        }
    };
    
    const handleEdit = (visit: EnrichedDealVisit) => {
        setEditingVisit(visit);
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
                                dailyStats={dailyStatsMap[installer.id]}
                                visits={groupedVisits.get(installer.id) || []}
                                onAssign={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                                onShare={handleShareClick}
                                onViewDetails={(visit) => setDetailsVisit(visit)}
                            />
                        ))}
                    </div>
                </TabsContent>
                <TabsContent value="all" className="mt-4">
                    <div>
                        <AllVisitsTable
                            visits={allVisits}
                            assigneeNameById={assigneeNameById}
                            onAssign={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                            onShare={handleShareClick}
                            onViewDetails={(visit) => setDetailsVisit(visit)}
                            onTransfer={(visit) => { setSelectedVisit(visit); setIsAssigning(true); }}
                            onUnassign={handleUnassign}
                            onEdit={handleEdit}
                        />
                    </div>
                </TabsContent>
            </Tabs>
            
            <Dialog open={!!detailsVisit} onOpenChange={() => setDetailsVisit(null)} >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Visit Details</DialogTitle>
                    </DialogHeader>
                    
                    {detailsVisit && (
                        <div className="py-4 space-y-4">
                            <p><strong>Customer Name:</strong> <Badge variant="outline" className="capitalize">{detailsVisit.customer?.name}</Badge></p>
                            <p><strong>Customer Mobile No:</strong> <Badge variant="outline" className="capitalize">{detailsVisit.customer?.mobileNo}</Badge></p>
                            <p><strong>Customer Address:</strong> <Badge variant="outline" className="capitalize">{detailsVisit.customer?.addressPinCode}</Badge></p>
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
                            <p><strong>Scheduled Date:</strong> {detailsVisit.dueDate ? format(new Date(detailsVisit.dueDate), 'PPP p') : 'Not Set'}</p>
                            <p><strong>Scheduled Slot:</strong> {detailsVisit.slotLabel || 'N/A'}</p>
                            <p><strong>Assigned To:</strong> {detailsVisit.assignedTo ? (assigneeNameById[detailsVisit.assignedTo] || 'Unknown') : 'Unassigned'}</p>
                            <p><strong>Status:</strong> {renderVisitStatus(detailsVisit)}</p>
                            <p><strong>Created By:</strong> {detailsVisit.createdBy}</p>
                            <p><strong>Created At:</strong> {detailsVisit.createdAt ? format(new Date(detailsVisit.createdAt), 'PPP p') : 'N/A'}</p>
                            {detailsVisit.visitStartTime && <p><strong>Visit Start Time:</strong> {format(new Date(detailsVisit.visitStartTime), 'PPP p')}</p>}
                            {detailsVisit.visitEndTime && <p><strong>Visit End Time:</strong> {format(new Date(detailsVisit.visitEndTime), 'PPP p')}</p>}
                            {detailsVisit.remark && <p><strong>Remark:</strong> {detailsVisit.remark}</p>}
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
                    slotId: selectedVisit.slotId || undefined,
                    slotIds: selectedVisit.slotIds?.length
                      ? selectedVisit.slotIds
                      : selectedVisit.slotId
                        ? [selectedVisit.slotId]
                        : undefined,
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

            <EditVisitDialog 
                visit={editingVisit} 
                isOpen={!!editingVisit} 
                onClose={() => setEditingVisit(null)}
                salesmen={users}
                onSuccess={() => { /* onSnapshot will handle refresh */ }}
            />
        </div>
    );
}
