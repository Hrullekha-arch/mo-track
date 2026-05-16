"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  memo,
} from "react";

import {
  Customer,
  DealVisit,
  DealOrder,
  Selection,
  User,
} from "@/lib/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Calendar,
  Eye,
} from "lucide-react";

import { VisitForm } from "@/app/dashboard/customers/[customerId]/[dealId]/dialogs.tsx/VisitForm";

import {
  getVisitsForDeal,
  getOrdersForDeal,
  getSelectionsForDeal,
} from "../../actions";
import { getSalesmen } from "../../../../actions";

import { parseDateNullable } from "../../utils/dateUtils";
import { Skeleton } from "@/components/ui/skeleton";

// ================= PROPS =================

interface VisitsTabProps {
  customerId: string;
  dealId: string;
  customers: Customer[];
}

// ================= HELPERS =================

const asArray = (val: any): any[] => {
  if (!val) return [];

  if (Array.isArray(val)) return val;

  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
};

const Pill = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <Badge
    variant="secondary"
    className="text-xs"
  >
    {children}
  </Badge>
);

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: any;
}) => (
  <div className="flex justify-between py-1.5 text-sm">
    <span className="text-muted-foreground">
      {label}
    </span>

    <span className="font-medium">
      {value || "—"}
    </span>
  </div>
);

const safeFormat = (
  val: any,
  fmt = "PPP p"
) => {
  const d = parseDateNullable(val);

  if (!d) return "N/A";

  try {
    const { format } = require("date-fns");
    return format(d, fmt);
  } catch {
    return "N/A";
  }
};

const repName = (
  salesmen: User[],
  repIdOrName: any
) =>
  salesmen.find(
    (s) => s.id === repIdOrName
  )?.name ||
  repIdOrName ||
  "-";

// ================= DETAIL RENDER =================

const renderMeasurementDetails = (
  visit: any
) => {
  const measurements = asArray(
    visit.measurements
  );

  return (
    <div className="space-y-4">

      {visit.selectionId && (
        <InfoRow
          label="Selection ID"
          value={visit.selectionId}
        />
      )}

      {visit.remark && (
        <InfoRow
          label="Remark"
          value={visit.remark}
        />
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">
          Measurements
        </p>

        <div className="flex flex-wrap gap-1.5">
          {measurements.length ? (
            measurements.map((m: string) => (
              <Pill key={m}>
                {m}
              </Pill>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              —
            </span>
          )}
        </div>
      </div>

    </div>
  );
};

const renderDeliveryDetails = (
  visit: any
) => {
  const deliveryInstallations =
    (
      asArray(
        visit.deliveryInstallations
      ) || []
    ).filter(Boolean);

  return (
    <div className="space-y-4">

      {visit.otherDelivery && (
        <InfoRow
          label="Other Delivery"
          value={visit.otherDelivery}
        />
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">
          Delivery Items
        </p>

        {deliveryInstallations.length ? (
          <div className="space-y-2">

            {deliveryInstallations.map(
              (
                x: any,
                idx: number
              ) => (
                <div
                  key={idx}
                  className="flex justify-between rounded bg-muted/50 p-2 text-sm"
                >
                  <span>
                    {x.id || "-"}
                  </span>

                  <span className="font-medium">
                    {x.noOfPcs || "1"} pcs
                  </span>
                </div>
              )
            )}

          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            —
          </span>
        )}
      </div>

    </div>
  );
};

// ================= ROW =================

const VisitRow = memo(
  function VisitRow({
    visit,
    index,
    salesmen,
    onView,
  }: {
    visit: DealVisit;
    index: number;
    salesmen: User[];
    onView: () => void;
  }) {
    return (
      <TableRow>

        <TableCell>
          {index + 1}
        </TableCell>

        <TableCell className="capitalize">
          {visit.typeOfVisit}
        </TableCell>

        <TableCell>
          {visit.dueDate
            ? safeFormat(visit.dueDate)
            : "Not Set"}
        </TableCell>

        <TableCell>
          <Badge
            variant="outline"
            className="capitalize"
          >
            {visit.status ||
              "requested"}
          </Badge>
        </TableCell>

        <TableCell>
          {repName(
            salesmen,
            visit.assignedSalesPerson?.name
          )}
          
        </TableCell>

        <TableCell>
          {visit.createdBy}
        </TableCell>

        <TableCell>
          {safeFormat(
            visit.createdAt,
            "dd/MM/yy"
          )}
        </TableCell>

        <TableCell>

          <Button
            size="sm"
            variant="outline"
            onClick={onView}
          >
            <Eye className="h-4 w-4" />
          </Button>

        </TableCell>

      </TableRow>
    );
  }
);

// ================= PAGE =================

export default function VisitsTab({
    customers,
  customerId,
  dealId,
}: VisitsTabProps) {


  // ================= STATES =================
  const [salesmen, setSalesmen] =
    useState<User[]>([]);

  const [visits, setVisits] =
    useState<DealVisit[]>([]);

  const [orders, setOrders] =
    useState<DealOrder[]>([]);

  const [selections, setSelections] =
    useState<Selection[]>([]);

  const [selectedVisit, setSelectedVisit] =
    useState<DealVisit | null>(null);

  const [formDataLoading, setFormDataLoading] =
    useState(false);

  const [fetching, setFetching] =
    useState(false);

  // ================= FETCH =================

  const fetchAllData =
    useCallback(async () => {
        setFetching(true);
      try {

        setFormDataLoading(true);

        const [
          salesmenData,
          visitsData,
          ordersData,
          selectionsData,
        ] = await Promise.all([
          getSalesmen(),
          getVisitsForDeal(
            customerId,
            dealId
          ),

          getOrdersForDeal(
            customerId,
            dealId
          ),

          getSelectionsForDeal(
            customerId,
            dealId
          ),
        ]);

        setSalesmen(salesmenData || []);
        setVisits(visitsData || []);
        setOrders(ordersData || []);
        setSelections(
          selectionsData || []
        );

      } catch (error) {
        console.error(
          "Fetch Visits Error:",
          error
        );
      } finally {
        setFormDataLoading(false);
        setFetching(false);
      }
    }, [customerId, dealId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);


  // ================= REFRESH =================

  const handleVisitAdded =
    async () => {
      await fetchAllData();
    };

  // ================= UI =================

  return (
    <div className="space-y-4">

      {/* FORM */}
      <VisitForm
        customer={customers?.[0]}
        customerId={customerId}
        dealId={dealId}
        onVisitAdded={
          handleVisitAdded
        }
        visits={visits}
        orders={orders}
        selections={selections}
        formDataLoading={
          formDataLoading
        }
      />

      {/* HISTORY */}
      <Card>

        <CardHeader className="pb-3">

          <CardTitle className="text-lg">
            Visit History
          </CardTitle>

        </CardHeader>

        <CardContent>

            <div className="overflow-x-auto">

              <Table>

                <TableHeader>

                  <TableRow>

                    <TableHead>
                      #
                    </TableHead>

                    <TableHead>
                      Type
                    </TableHead>

                    <TableHead>
                      Due Date
                    </TableHead>

                    <TableHead>
                      Status
                    </TableHead>

                    <TableHead>
                      Representative
                    </TableHead>

                    <TableHead>
                      Created By
                    </TableHead>

                    <TableHead>
                      Created At
                    </TableHead>

                    <TableHead>
                      Details
                    </TableHead>

                  </TableRow>

                </TableHeader>

                <TableBody>
               {visits.length > 0 && (
                <>
                  {visits.map(
                    (
                      visit,
                      i
                    ) => (
                      <VisitRow
                        key={visit.id}
                        visit={visit}
                        index={i}
                        salesmen={
                          salesmen
                        }
                        onView={() =>
                          setSelectedVisit(
                            visit
                          )
                        }
                      />
                    )
                  )}
                  </>
                  ) }{fetching && (
                    <TableRow>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                        <TableCell className="text-center">
                            <Skeleton className="h-6 w-full" />
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>

              </Table>

            </div>
                    {/* //=============Empty State */}
          {visits.length === 0 && !fetching && (
            <div className="text-center py-10">
              <Calendar className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                No visits found for this deal.
              </p>
            </div>
          )}

        </CardContent>

      </Card>

      {/* DETAILS DIALOG */}
      {selectedVisit && (

        <Dialog
          open={!!selectedVisit}
          onOpenChange={() =>
            setSelectedVisit(null)
          }
        >

          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">

            <DialogHeader>

              <DialogTitle>
                Visit Details
              </DialogTitle>

              <DialogDescription>
                Visit on{" "}
                {selectedVisit.dueDate
                  ? safeFormat(
                      selectedVisit.dueDate
                    )
                  : "N/A"}
              </DialogDescription>

            </DialogHeader>

            <div className="space-y-4 py-4">

              {selectedVisit.typeOfVisit ===
              "measurement"
                ? renderMeasurementDetails(
                    selectedVisit
                  )
                : renderDeliveryDetails(
                    selectedVisit
                  )}

            </div>

            <DialogFooter>

              <Button
                variant="outline"
                onClick={() =>
                  setSelectedVisit(null)
                }
              >
                Close
              </Button>

            </DialogFooter>

          </DialogContent>

        </Dialog>
      )}

    </div>
  );
}
