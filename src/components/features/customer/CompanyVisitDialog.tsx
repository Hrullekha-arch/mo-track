"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlusCircleIcon, XCircleIcon } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TeamMemberKind = "employee" | "tailor";
type VisitCategory = "company_visit" | "tailor_work";
type VisitStatus = "planned" | "in_progress" | "completed" | "on_hold";
type WorkMode = "customer_home" | "outside_workshop" | "factory_visit" | "sample_meeting";

type TeamMember = {
  id: string;
  name: string;
  kind: TeamMemberKind;
};

type TrackerEntry = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  category: VisitCategory;
  purpose: string;
  status: VisitStatus;
  assignedToId: string;
  assignedToName: string;
  assignedRole: TeamMemberKind;
  workMode: WorkMode;
  from: string;
  to: string;
  visitDate: string;
  startTime: string;
  endTime: string;
  remark: string;
};

const defaultTeamMembers: TeamMember[] = [
  { id: "emp-1", name: "Rahul Sharma", kind: "employee" },
  { id: "emp-2", name: "Vishal Dubey", kind: "employee" },
  { id: "tailor-1", name: "Mukesh", kind: "tailor" },
  { id: "tailor-2", name: "Ramesh", kind: "tailor" },
];

const purposeByCategory: Record<VisitCategory, Array<{ value: string; label: string }>> = {
  company_visit: [
    { value: "sample_showing", label: "Sample Showing" },
    { value: "employee_work", label: "Employee Site Work" },
    { value: "material_check", label: "Material Check" },
    { value: "client_followup", label: "Client Follow Up" },
  ],
  tailor_work: [
    { value: "outside_stitching", label: "Outside Stitching Work" },
    { value: "alteration_work", label: "Alteration Work" },
    { value: "pickup_drop", label: "Pickup / Drop Work" },
    { value: "stitching_support", label: "Stitching Support Visit" },
  ],
};

const statusLabel: Record<VisitStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

const statusBadgeClass: Record<VisitStatus, string> = {
  planned: "border-slate-200 bg-slate-50 text-slate-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
};

const categoryLabel: Record<VisitCategory, string> = {
  company_visit: "Company Visit",
  tailor_work: "Tailor Work",
};

const workModeLabel: Record<WorkMode, string> = {
  customer_home: "Customer Home",
  outside_workshop: "Outside Workshop",
  factory_visit: "Factory Visit",
  sample_meeting: "Sample Meeting",
};

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toTitle = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export default function CompanyVisitDialog({ open, onOpenChange }: Props) {
  const [category, setCategory] = useState<VisitCategory>("company_visit");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<VisitStatus>("planned");
  const [workMode, setWorkMode] = useState<WorkMode>("sample_meeting");
  const [assignedToId, setAssignedToId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remark, setRemark] = useState("");
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<TeamMember[]>(defaultTeamMembers);
  const [memberInput, setMemberInput] = useState("");
  const [memberTypeInput, setMemberTypeInput] = useState<TeamMemberKind>("employee");
  const [showAddMember, setShowAddMember] = useState(false);

  const [trackerRows, setTrackerRows] = useState<TrackerEntry[]>([]);

  useEffect(() => {
    const trackerQuery = query(collection(db, "companyVisits"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      trackerQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docItem) => {
          const data = docItem.data() as any;
          return {
            id: docItem.id,
            createdAt: String(data?.createdAt || ""),
            updatedAt: String(data?.updatedAt || ""),
            category: data?.category as VisitCategory,
            purpose: String(data?.purpose || ""),
            status: data?.status as VisitStatus,
            assignedToId: String(data?.assignedToId || ""),
            assignedToName: String(data?.assignedToName || ""),
            assignedRole: data?.assignedRole as TeamMemberKind,
            workMode: data?.workMode as WorkMode,
            from: String(data?.from || ""),
            to: String(data?.to || ""),
            visitDate: String(data?.visitDate || ""),
            startTime: String(data?.startTime || ""),
            endTime: String(data?.endTime || ""),
            remark: String(data?.remark || ""),
          } as TrackerEntry;
        });
        setTrackerRows(rows);
      },
      (error) => {
        console.error("Failed to load company tracker rows:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const options = purposeByCategory[category];
    const firstValue = options[0]?.value || "";
    setPurpose((previous) => {
      const stillValid = options.some((opt) => opt.value === previous);
      return stillValid ? previous : firstValue;
    });
    setAssignedToId("");
    setWorkMode(category === "tailor_work" ? "outside_workshop" : "sample_meeting");
  }, [category]);

  const requiredMemberKind: TeamMemberKind = category === "tailor_work" ? "tailor" : "employee";

  const assignableMembers = useMemo(
    () => members.filter((member) => member.kind === requiredMemberKind),
    [members, requiredMemberKind]
  );

  const trackerSummary = useMemo(() => {
    return {
      total: trackerRows.length,
      planned: trackerRows.filter((row) => row.status === "planned").length,
      inProgress: trackerRows.filter((row) => row.status === "in_progress").length,
      completed: trackerRows.filter((row) => row.status === "completed").length,
      onHold: trackerRows.filter((row) => row.status === "on_hold").length,
    };
  }, [trackerRows]);

  const recentRows = useMemo(
    () =>
      [...trackerRows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [trackerRows]
  );

  const resetForm = () => {
    setCategory("company_visit");
    setStatus("planned");
    setFrom("");
    setTo("");
    setVisitDate("");
    setStartTime("");
    setEndTime("");
    setRemark("");
    setAssignedToId("");
    setPurpose(purposeByCategory.company_visit[0]?.value || "");
    setWorkMode("sample_meeting");
  };

  const handleAddMember = () => {
    const nextName = memberInput.trim();
    if (!nextName) return;
    if (members.some((member) => member.name.toLowerCase() === nextName.toLowerCase())) {
      toast.error("Team member already exists.");
      return;
    }
    setMembers((previous) => [
      ...previous,
      { id: makeId(), name: nextName, kind: memberTypeInput },
    ]);
    setMemberInput("");
    toast.success("Team member added.");
  };

  const handleRemoveMember = (id: string) => {
    setMembers((previous) => previous.filter((member) => member.id !== id));
    if (assignedToId === id) {
      setAssignedToId("");
    }
  };

  const handleStatusUpdate = async (id: string, nextStatus: VisitStatus) => {
    try {
      await updateDoc(doc(db, "companyVisits", id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      toast.success(`Status updated to ${statusLabel[nextStatus]}.`);
    } catch (error) {
      console.error("Failed to update visit tracker status:", error);
      toast.error("Unable to update status right now.");
    }
  };

  const handleSubmit = async () => {
    if (!purpose || !assignedToId || !from || !to || !visitDate || !startTime || !endTime) {
      toast.error("Please fill all required tracker fields.");
      return;
    }

    const selectedMember = members.find((member) => member.id === assignedToId);
    if (!selectedMember) {
      toast.error("Please choose a valid assignee.");
      return;
    }

    setCreating(true);
    const payload = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      category,
      purpose,
      status,
      assignedToId: selectedMember.id,
      assignedToName: selectedMember.name,
      assignedRole: selectedMember.kind,
      workMode,
      from: from.trim(),
      to: to.trim(),
      visitDate,
      startTime,
      endTime,
      remark: remark.trim(),
    };

    try {
      await addDoc(collection(db, "companyVisits"), payload);
      setCreating(false);
      toast.success("Tracker entry created.");
      resetForm();
    } catch (error) {
      setCreating(false);
      console.error("Failed to create tracker entry:", error);
      toast.error("Unable to create tracker entry right now.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Company & Tailor Visit Tracker</DialogTitle>
          <DialogDescription>
            Track employee sample/site visits and tailor stitching/outside work in one flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold">{trackerSummary.total}</p>
              </div>
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="text-2xl font-semibold">{trackerSummary.planned}</p>
              </div>
              <div className="rounded-md border bg-sky-50 p-3">
                <p className="text-xs text-sky-700">In Progress</p>
                <p className="text-2xl font-semibold text-sky-700">{trackerSummary.inProgress}</p>
              </div>
              <div className="rounded-md border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Completed</p>
                <p className="text-2xl font-semibold text-emerald-700">{trackerSummary.completed}</p>
              </div>
              <div className="rounded-md border bg-amber-50 p-3">
                <p className="text-xs text-amber-700">On Hold</p>
                <p className="text-2xl font-semibold text-amber-700">{trackerSummary.onHold}</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <Label>Visit Category *</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as VisitCategory)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_visit">Company Visit</SelectItem>
                    <SelectItem value="tailor_work">Tailor Work</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Purpose *</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {purposeByCategory[category].map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status *</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as VisitStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Work Mode *</Label>
                <Select value={workMode} onValueChange={(value) => setWorkMode(value as WorkMode)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_home">Customer Home</SelectItem>
                    <SelectItem value="outside_workshop">Outside Workshop</SelectItem>
                    <SelectItem value="factory_visit">Factory Visit</SelectItem>
                    <SelectItem value="sample_meeting">Sample Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <Label>
                    Assign {requiredMemberKind === "tailor" ? "Tailor" : "Employee"} *
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setShowAddMember((previous) => !previous)}
                  >
                    {showAddMember ? <XCircleIcon className="h-4 w-4" /> : <PlusCircleIcon className="h-4 w-4" />}
                  </Button>
                </div>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${requiredMemberKind}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>From *</Label>
                <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Current location" />
              </div>

              <div>
                <Label>To *</Label>
                <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="Visit location" />
              </div>
            </div>

            {showAddMember && (
              <Card className="border-dashed p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={memberTypeInput}
                      onValueChange={(value) => setMemberTypeInput(value as TeamMemberKind)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="tailor">Tailor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={memberInput}
                      onChange={(event) => setMemberInput(event.target.value)}
                      placeholder="Enter name"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" className="w-full" onClick={handleAddMember}>
                      Add Team Member
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label>Visit Date *</Label>
                <Input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
              </div>
              <div>
                <Label>Start Time *</Label>
                <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </div>
              <div>
                <Label>End Time *</Label>
                <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </div>
            </div>

            <div>
              <Label>Work Notes</Label>
              <Textarea
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="Add stitching/work/sample remarks"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={creating}>
                {creating ? "Saving..." : "Add To Tracker"}
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent Tracker Entries</h3>
              <p className="text-xs text-muted-foreground">
                Update status to track current tailor/company work.
              </p>
            </div>

            {recentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracker entries yet.</p>
            ) : (
              <div className="space-y-2">
                {recentRows.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{categoryLabel[entry.category]}</Badge>
                      <Badge variant="outline" className={statusBadgeClass[entry.status]}>
                        {statusLabel[entry.status]}
                      </Badge>
                      <Badge variant="secondary">{toTitle(entry.purpose)}</Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-4">
                      <p>
                        <span className="font-medium text-foreground">Assigned:</span> {entry.assignedToName} (
                        {entry.assignedRole})
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Route:</span> {entry.from} {"->"} {entry.to}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Schedule:</span> {entry.visitDate} {entry.startTime}-
                        {entry.endTime}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Mode:</span> {workModeLabel[entry.workMode]}
                      </p>
                    </div>

                    {entry.remark && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Notes:</span> {entry.remark}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={entry.status === "in_progress" ? "default" : "outline"}
                        onClick={() => handleStatusUpdate(entry.id, "in_progress")}
                      >
                        In Progress
                      </Button>
                      <Button
                        size="sm"
                        variant={entry.status === "completed" ? "default" : "outline"}
                        onClick={() => handleStatusUpdate(entry.id, "completed")}
                      >
                        Completed
                      </Button>
                      <Button
                        size="sm"
                        variant={entry.status === "on_hold" ? "default" : "outline"}
                        onClick={() => handleStatusUpdate(entry.id, "on_hold")}
                      >
                        On Hold
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="inline-flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-xs"
                >
                  <span>
                    {member.name} ({member.kind})
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    <XCircleIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
