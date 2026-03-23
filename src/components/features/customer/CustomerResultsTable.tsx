"use client";

import { Customer } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Loader2,
  Search,
  Trash2,
  Users,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CustomerResultsTableProps {
  customers: Customer[];
  isLoading: boolean;
  hasSearched: boolean;
  onCustomerSelect?: (customer: Customer) => void;
}

export function CustomerResultsTable({
  customers,
  isLoading,
  hasSearched,
  onCustomerSelect,
}: CustomerResultsTableProps) {
  const user = useAuth();
  const isAdmin = user?.role === "admin";

  // Track which customer IDs are currently being deleted
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Track optimistic removal: IDs that have been deleted (hide from UI immediately)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  async function deleteCustomer(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deleteDoc(doc(db, "customers", id));
      // Optimistically hide the row right away
      setDeletedIds((prev) => new Set(prev).add(id));
      toast.success("Customer deleted successfully", {
        description: "The customer record has been permanently removed.",
      });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete customer", {
        description: "Something went wrong. Please try again.",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const visibleCustomers = customers.filter((c) => !deletedIds.has(c.id));

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold tracking-tight">
            Searching…
          </CardTitle>
          <CardDescription className="text-sm">
            Looking for matching customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">
            Fetching results…
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Empty / pre-search state ───────────────────────────────────────────────
  if (!hasSearched) {
    return (
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold tracking-tight">
            Search Results
          </CardTitle>
          <CardDescription className="text-sm">
            Customers matching your criteria will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">
              No search yet
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Enter your criteria above and click{" "}
              <span className="font-medium text-foreground">Search</span> to see
              results.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  return (
    <Card className="border border-border/60 shadow-sm overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-4 flex flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold tracking-tight">
              Search Results
            </CardTitle>
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
            >
              {visibleCustomers.length}
            </Badge>
          </div>
          <CardDescription className="text-sm mt-1">
            {visibleCustomers.length > 0
              ? "Showing customers matching your criteria."
              : "No customers found matching your criteria."}
          </CardDescription>
        </div>
        <div className="shrink-0 h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {visibleCustomers.length > 0 ? (
          <div className="border-t border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Phone
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assigned To
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="pr-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCustomers.map((customer, idx) => {
                  const isDeleting = deletingIds.has(customer.id);
                  return (
                    <TableRow
                      key={customer.id}
                      className={cn(
                        "group transition-all duration-200",
                        isDeleting && "opacity-50 pointer-events-none",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                      )}
                    >
                      {/* Name */}
                      <TableCell className="pl-6 py-4 font-medium text-sm text-foreground">
                        {customer.name}
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="py-4 text-sm text-muted-foreground font-mono">
                        {customer.phone || customer.mobileNo || (
                          <span className="text-border">—</span>
                        )}
                      </TableCell>

                      {/* Assigned to */}
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className="text-xs font-medium rounded-md px-2 py-0.5"
                        >
                          {customer.assignedSalesPerson?.name ||
                            customer.salesSupport ||
                            "Unassigned"}
                        </Badge>
                      </TableCell>

                      {/* Created at */}
                      <TableCell className="py-4 text-sm text-muted-foreground">
                        {format(new Date(customer.createdAt), "dd MMM yyyy")}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Delete — admin only */}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isDeleting}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  aria-label={`Delete ${customer.name}`}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>

                              <AlertDialogContent className="max-w-md">
                                <AlertDialogHeader className="gap-3">
                                  {/* Warning icon */}
                                  <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <AlertTriangle className="h-6 w-6 text-destructive" />
                                  </div>
                                  <AlertDialogTitle className="text-center text-lg">
                                    Delete customer?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-center text-sm leading-relaxed">
                                    You're about to permanently delete{" "}
                                    <span className="font-semibold text-foreground">
                                      {customer.name}
                                    </span>
                                    . This action{" "}
                                    <span className="font-semibold text-destructive">
                                      cannot be undone
                                    </span>{" "}
                                    and will remove all associated data from our
                                    servers.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter className="mt-2 gap-2 sm:gap-2">
                                  <AlertDialogCancel className="flex-1 sm:flex-none">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCustomer(customer.id)}
                                    className="flex-1 sm:flex-none bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
                                  >
                                    Yes, delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {/* Navigate / Select */}
                          {onCustomerSelect ? (
                            <Button
                              onClick={() => onCustomerSelect(customer)}
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                            >
                              Select
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          ) : customer.customerId || customer.id ? (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Link
                                href={`/dashboard/customers/${
                                  customer.customerId || customer.id
                                }`}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-destructive font-medium">
                              No ID
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Zero results state */
          <div className="border-t border-border/60 flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                No customers found
              </p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search criteria.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}