
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
                                                <div className="flex flex-col items-end gap-1">
                                                    {renderVisitStatus(visit)}
                                                    {visit.typeOfVisit === 'measurement' && visit.status === 'completed' && (
                                                        visit.measurementPdfUrl ? (
                                                            <Button variant="outline" size="sm" asChild className="h-6 text-xs px-2 mt-1">
                                                                <a href={visit.measurementPdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                                                                    <Download className="h-3 w-3" /> Download
                                                                </a>
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground mt-1">-</span>
                                                        )
                                                    )}
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
    onViewDetails: (EnrichedDealVisit) => void, 
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
                            <TableHead>Date &amp; Slot</TableHead>
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
                                        {visit.typeOfVisit === 'measurement' && visit.status === 'completed' && (
                                            visit.measurementPdfUrl ? (
                                                <Button variant="outline" size="sm" asChild className="h-6 text-xs px-2 mt-1">
                                                    <a href={visit.measurementPdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                                                        <Download className="h-3 w-3" /> Download
                                                    </a>
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground mt-1">-</span>
                                            )
                                        )}
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
//...rest of the file
