"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTransition } from "react";
import { ownerTypeFromUser } from "@/lib/owners";
import { useCallback } from "react";

const weekOptions = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type WeekDay = (typeof weekOptions)[number];

export default function AccountPage() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [weekOff, setWeekOff] = useState<WeekDay>("Sunday");
  const [assignedSalesman, setAssignedSalesman] = useState("");
  const [assignedSalesmanId, setAssignedSalesmanId] = useState("");
  const [handoverToType, setHandoverToType] = useState("SALESMAN");
  const [handoverToId, setHandoverToId] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [salesmanOptions, setSalesmanOptions] = useState<{ id: string; name: string }[]>([]);
  const [backupOptions, setBackupOptions] = useState<{ id: string; name: string }[]>([]);
  const [backupOwnerId, setBackupOwnerId] = useState("");
  const [pendingHandovers, setPendingHandovers] = useState<any[]>([]);
  const apiBase = "/api/account/handover";

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    const savedWeekOff = user.weekOff || user.dayOff;
    const normalizedWeekOff = savedWeekOff
      ? `${savedWeekOff.charAt(0).toUpperCase()}${savedWeekOff.slice(1).toLowerCase()}`
      : "Sunday";
    setWeekOff((weekOptions.includes(normalizedWeekOff as WeekDay) ? normalizedWeekOff : "Sunday") as WeekDay);
    setAssignedSalesman(((user as any).assignedSalesmanName as string) || "");
    setAssignedSalesmanId(((user as any).assignedSalesmanId as string) || "");
    setBackupOwnerId(((user as any).backupOwnerId as string) || "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    startTransition(async () => {
      const [salesmenRes, backupRes, pendingRes] = await Promise.all([
        fetch(`${apiBase}?mode=salesmen&crmUserId=${user.id}`).then((r) => r.json()),
        fetch(`${apiBase}?mode=backup&role=${user.role}&designation=${(user as any).designation || ""}`).then((r) => r.json()),
        fetch(`${apiBase}?mode=pending&toOwnerId=${user.id}`).then((r) => r.json()),
      ]);
      if (salesmenRes.success) setSalesmanOptions(salesmenRes.data);
      if (backupRes.success) setBackupOptions(backupRes.data);
      if (pendingRes.success) setPendingHandovers(pendingRes.data);
    });
  }, [user]);

  const roleBadge = useMemo(() => user?.role ?? "user", [user]);

  const handleSaveProfile = () => {
    if (!user) return;
    startTransition(async () => {
      const resp = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "prefs",
          payload: {
            userId: user.id,
            weekOff,
            assignedSalesmanId,
            assignedSalesmanName: assignedSalesman,
            backupOwnerId,
            backupOwnerName: backupOptions.find((o) => o.id === backupOwnerId)?.name,
          },
        }),
      });
      const result = await resp.json();
      if (result.success) {
        toast({ title: "Preferences saved" });
      } else {
        toast({ variant: "destructive", title: "Save failed", description: result.message });
      }
    });
  };

  const handleRequestReset = async () => {
    if (!firebaseUser?.email) {
      toast({ variant: "destructive", title: "No email available to reset." });
      return;
    }
    // Surface guidance; actual reset flow should live in auth actions.
    toast({
      title: "Reset link",
      description: "Use the login screen's 'Forgot password' to get a reset email.",
    });
  };

  const handleHandover = () => {
    if (!user) return;
    if (!handoverToId) {
      toast({ variant: "destructive", title: "Please enter an assignee ID." });
      return;
    }
    startTransition(async () => {
      const fromOwnerType = ownerTypeFromUser(user.role, (user as any).designation);
      const resp = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "request",
          payload: {
            fromUserId: user.id,
            fromOwnerType,
            toOwnerId: handoverToId.trim(),
            toOwnerType: handoverToType as any,
            note: handoverNote,
          },
        }),
      });
      const result = await resp.json();
      if (result.success) {
        toast({ title: "Handover request sent", description: result.message });
        setHandoverNote("");
        setHandoverToId("");
      } else {
        toast({ variant: "destructive", title: "Handover failed", description: result.message });
      }
    });
  };

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>My Account</CardTitle>
            <CardDescription>Please sign in to view your account.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Account</h1>
          <p className="text-muted-foreground">
            Manage your profile, preferences, and handover settings.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          {roleBadge}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Basic details for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Week Off</Label>
                <Select value={weekOff} onValueChange={(value: WeekDay) => setWeekOff(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Salesman</Label>
                <div
                  value={assignedSalesmanId}
                  onValueChange={(value) => {
                    setAssignedSalesmanId(value);
                    const found = salesmanOptions.find((s) => s.id === value);
                    setAssignedSalesman(found?.name || "");
                  }}
                >
                  <div>
                    {salesmanOptions.map((s) => (
                      <div key={s.id} value={s.id}>
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveProfile} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Profile"}
              </Button>
              <Button variant="outline" onClick={handleRequestReset}>
                Forgot Password
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/dashboard">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Reset your password when needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use the login page&apos;s &quot;Forgot password&quot; link to get a reset email. You&apos;re
              currently signed in as <strong>{email}</strong>.
            </p>
            <Button variant="secondary" onClick={handleRequestReset}>
              Send Reset Instructions
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Handover</CardTitle>
            <CardDescription>
              Draft a handover request to route your work while you&apos;re away.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Handover To (Role)</Label>
                <Select value={handoverToType} onValueChange={setHandoverToType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRM">CRM</SelectItem>
                    <SelectItem value="SALESMAN">Salesman</SelectItem>
                    <SelectItem value="ACCOUNT">Account</SelectItem>
                    <SelectItem value="ALLOCATOR">Allocator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignee ID</Label>
                <Select value={handoverToId} onValueChange={setHandoverToId}>
                <SelectTrigger>
                  <SelectValue placeholder="User ID / email" />
                </SelectTrigger>
                <SelectContent>
                  {backupOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="Scope, dates, or context for the handover."
              />
            </div>
            <Button onClick={handleHandover} disabled={!handoverToId || isSubmitting}>
              {isSubmitting ? "Submitting..." : "Request Handover"}
            </Button>
            <p className="text-xs text-muted-foreground">
              This triggers the universal handover routing by writing a `handover_requests` record
              and auto-activating it.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>See who is covering your work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set a backup owner to receive your work when you are on leave/week-off.
            </p>
            <div className="space-y-2">
              <Label>Backup Owner</Label>
              <Select value={backupOwnerId} onValueChange={setBackupOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select backup owner" />
                </SelectTrigger>
                <SelectContent>
                  {backupOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Acting Owner</Label>
              <Input value={(user as any).actingOwnerName || "You"} readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Handover Requests</CardTitle>
            <CardDescription>Requests sent to you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingHandovers.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            )}
            {pendingHandovers.map((req) => (
              <div key={req.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">From: {req.fromOwnerName}</p>
                    <p className="text-xs text-muted-foreground">{req.note || "No note provided."}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        startTransition(async () => {
                          const resp = await fetch(apiBase, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              mode: "accept",
                              payload: { handoverRequestId: req.id, actingUserId: user?.id || "" },
                            }),
                          });
                          const result = await resp.json();
                          if (result.success) {
                            toast({ title: "Accepted" });
                            const refreshed = await fetch(`${apiBase}?mode=pending&toOwnerId=${user?.id || ""}`).then((r) => r.json());
                            if (refreshed.success) setPendingHandovers(refreshed.data);
                          } else {
                            toast({ variant: "destructive", title: "Failed", description: result.message });
                          }
                        })
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        startTransition(async () => {
                          const resp = await fetch(apiBase, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              mode: "reject",
                              payload: { handoverRequestId: req.id, actingUserId: user?.id || "" },
                            }),
                          });
                          const result = await resp.json();
                          if (result.success) {
                            toast({ title: "Rejected" });
                            const refreshed = await fetch(`${apiBase}?mode=pending&toOwnerId=${user?.id || ""}`).then((r) => r.json());
                            if (refreshed.success) setPendingHandovers(refreshed.data);
                          } else {
                            toast({ variant: "destructive", title: "Failed", description: result.message });
                          }
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
