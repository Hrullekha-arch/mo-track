"use client";

import * as React from "react";
import { User } from "@/lib/types";
import { EnrichedDealVisit, InstallerTracking } from "@/types/visits";
import { useJobSuggestions, useDailyStats } from "@/hooks/visits/useInstallersTracking";
import { useToast } from "@/hooks/use-toast";
import VisitDetailsDialog from "../VisitDetailsDialog";
import ShareLinkDialog from "../ShareLinkDialog";
import AssignInstallerDialog from "../AssignInstallerDialog";
import InstallerCard from "../InstallerCard";

interface InstallersTabProps {
  installers: User[];
  visits: EnrichedDealVisit[];
  tracking: InstallerTracking[];
  users: User[];
}

export default function InstallersTab({
  installers,
  visits,
  tracking,
  users,
}: InstallersTabProps) {
  const { toast } = useToast();
  const suggestions = useJobSuggestions();
  const dailyStats = useDailyStats();

  const [selectedVisit, setSelectedVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [detailsVisit, setDetailsVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [shareableLink, setShareableLink] = React.useState<string | null>(null);
  const [isAssigning, setIsAssigning] = React.useState(false);

  const trackingByInstaller = React.useMemo(() => {
    const map = new Map<string, InstallerTracking>();
    tracking.forEach((d) => {
      const k = d.installerId || d.id;
      map.set(k, { ...d, installerId: k, id: d.id || k });
    });
    return map;
  }, [tracking]);

  const groupedVisits = React.useMemo(() => {
    const map = new Map<string, EnrichedDealVisit[]>();
    installers.forEach((i) => map.set(i.id, []));
    visits.forEach((v) => {
      if (v.assignedTo) {
        if (!map.has(v.assignedTo)) map.set(v.assignedTo, []);
        map.get(v.assignedTo)!.push(v);
      }
    });
    return map;
  }, [visits, installers]);

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

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {installers.map((installer) => (
          <InstallerCard
            key={installer.id}
            installer={installer}
            live={trackingByInstaller.get(installer.id)}
            suggestion={suggestions[installer.id]}
            dailyStats={dailyStats[installer.id]}
            visits={groupedVisits.get(installer.id) || []}
            onAssign={handleAssign}
            onShare={handleShareClick}
            onViewDetails={(v) => setDetailsVisit(v)}
          />
        ))}
      </div>

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
    </>
  );
}