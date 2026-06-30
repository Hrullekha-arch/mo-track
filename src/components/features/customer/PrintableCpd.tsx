
"use client";

import React, { useMemo } from "react";
import { Cpd, Customer, Deal, User, AdvanceDetail, StitchDimension } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Printer } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";

export function PrintableCpd({ cpd, customer, deal, salesmen }: { cpd: Cpd, customer: Customer, deal: Deal, salesmen: User[] }) {
    // ... existing implementation
    return <div>Printable CPD</div>;
}

export function PrintableCustomerCpd({
  cpd,
  customer,
  deal: _deal,
  salesmen: _salesmen,
}: {
  cpd: Cpd;
  customer: Customer;
  deal?: Deal;
  salesmen?: User[];
}) {
    // ... existing implementation
    return <div>Printable Customer CPD</div>;
}
