"use client";

import * as React from "react";
import { User } from "@/lib/types";
import { EnrichedDealVisit } from "@/types/visits";
import { useToast } from "@/hooks/use-toast";
import {
  deleteVisitAction,
  unassignVisitAction,
} from "@/app/dashboard/visits/actions";
import AllVisitsTable from "../AllVisitsTable";
import VisitDetailsDialog from "../VisitDetailsDialog";
import ShareLinkDialog from "../ShareLinkDialog";
import AssignInstallerDialog from "../AssignInstallerDialog";
import EditVisitDialog from "../EditVisitDialog";

interface AllVisitsTabProps {
  visits: EnrichedDealVisit[];
  installers: User[];
  users: User[];
}

export default function AllVisitsTab({
  visits,
  installers,
  users,
}: AllVisitsTabProps) {
  const { toast } = useToast();
  const [selectedVisit, setSelectedVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [detailsVisit, setDetailsVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [editingVisit, setEditingVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [shareableLink, setShareableLink] = React.useState<string | null>(null);
  const [isAssigning, setIsAssigning] = React.useState(false);

  const assigneeNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  const handleShareClick = (visit: EnrichedDealVisit) => {
    const link = `https://mo-track-yerq.vercel.app/visit/confirm/${visit.id}?customerId=${visit.customerId}&dealId=${visit.dealDocId}`;
    setShareableLink(link);
  };

  const handleAssign = (visit: EnrichedDealVisit) => {
    setSelectedVisit(visit);
    setIsAssigning(true);
  };

  const handleUnassign = async (visit: EnrichedDealVisit) => {
    try {
      const result = await unassignVisitAction(
        visit.id,
        visit.customerId,
        visit.dealDocId
      );
      toast(
        result.success
          ? { title: "Unassigned" }
          : {
              variant: "destructive",
              title: "Error",
              description: result.message,
            }
      );
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleDelete = async (visit: EnrichedDealVisit) => {
    try {
      const result = await deleteVisitAction(
        visit.id,
        visit.customerId,
        visit.dealDocId
      );
      toast(
        result.success
          ? { title: "Deleted" }
          : {
              variant: "destructive",
              title: "Error",
              description: result.message,
            }
      );
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  return (
    <>
      <AllVisitsTable
        visits={visits}
        installers={installers}
        assigneeNameById={assigneeNameById}
        onAssign={handleAssign}
        onShare={handleShareClick}
        onViewDetails={(v) => setDetailsVisit(v)}
        onUnassign={handleUnassign}
        onEdit={(v) => setEditingVisit(v)}
        onDelete={handleDelete}
      />

      <VisitDetailsDialog
        visit={detailsVisit}
        assigneeNameById={assigneeNameById}
        onClose={() => setDetailsVisit(null)}
      />

      <ShareLinkDialog
        link={shareableLink}
        onClose={() => setShareableLink(null)}
      />

      <AssignInstallerDialog
        isOpen={isAssigning}
        onClose={() => {
          setIsAssigning(false);
          setSelectedVisit(null);
        }}
        visit={selectedVisit}
        installers={installers}
      />

      <EditVisitDialog
        visit={editingVisit}
        isOpen={!!editingVisit}
        onClose={() => setEditingVisit(null)}
        salesmen={users}
        onSuccess={() => {}}
      />
    </>
  );
}