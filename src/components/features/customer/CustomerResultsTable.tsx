
"use client";

import { Customer } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface CustomerResultsTableProps {
  customers: Customer[];
  isLoading: boolean;
  hasSearched: boolean;
}

export function CustomerResultsTable({ customers, isLoading, hasSearched }: CustomerResultsTableProps) {
  
  if (isLoading) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Searching...</CardTitle>
                <CardDescription>Looking for matching customers.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-12">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            </CardContent>
        </Card>
    )
  }

  if (!hasSearched) {
      return (
        <Card>
            <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>Customers matching your criteria will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground py-12">
                <Search className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                <p>Enter search criteria and click "Search" to see results.</p>
            </CardContent>
        </Card>
      )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Results ({customers.length})</CardTitle>
        <CardDescription>
          {customers.length > 0 ? "Showing customers matching your criteria." : "No customers found matching your criteria."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {customers.length > 0 ? (
          <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Mobile No</TableHead>
                        <TableHead>Sales Support</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {customers.map((customer) => (
                        <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell>{customer.mobileNo}</TableCell>
                            <TableCell>
                                <Badge variant="outline">{customer.salesSupport || "N/A"}</Badge>
                            </TableCell>
                            <TableCell>{format(new Date(customer.createdAt), "PPP")}</TableCell>
                            <TableCell className="text-right">
                                <Button asChild variant="ghost" size="icon">
                                    <Link href={`/dashboard/customers/${customer.id}`}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-12">
            <p>No customers found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
