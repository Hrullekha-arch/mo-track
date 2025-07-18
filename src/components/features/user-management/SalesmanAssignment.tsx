
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { User } from '@/lib/types';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, Link, Link2Off } from 'lucide-react';

const salesmen = [
    "AAS (SAHOO)", "ASD (SAROJ DAS)", "ASB (ABHISHEK SINGH)", "AK (ABHISHEK CARPET)",
    "AM (MINTOO)", "BPS (PAWAN SHARMA)", "BTK (TAPESHWAR)", "CAY (ASHISH)",
    "CP (PRADEEP)", "DS (DAYAL)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "MU (MURARI)",
    "NK (NAND KISHOR)", "NKD (NEERAJ)", "RA (RAJEEV AGGARWAL)", "RSB (RAJENDRA BISHT)",
    "RK (RAJKUMAR)", "SD (SWETA)", "UMDP (UMESH)", "RD (Bhatiya)", "ANVR (Anvar)", "VD (Vishal Dubey)"
];

interface SalesmanAssignmentProps {
  crmUsers: User[];
}

interface Assignment {
  salesman: string;
  crmUserId: string;
}

export function SalesmanAssignment({ crmUsers }: SalesmanAssignmentProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    const assignmentsCollection = collection(db, "salesmanCrmAssignments");
    const unsubscribe = onSnapshot(assignmentsCollection, (snapshot) => {
      const assignmentsData: Record<string, string> = {};
      snapshot.forEach(doc => {
        assignmentsData[doc.id] = doc.data().crmUserId;
      });
      setAssignments(assignmentsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAssign = async (salesman: string, crmUserId: string) => {
    try {
      const assignmentRef = doc(db, "salesmanCrmAssignments", salesman);
      await setDoc(assignmentRef, { crmUserId });
      toast({ title: "Assignment Updated", description: `${salesman} assigned to a new CRM handler.` });
    } catch (error) {
      console.error("Error updating assignment:", error);
      toast({ variant: "destructive", title: "Update Failed" });
    }
  };
  
  const handleUnassign = async (salesman: string) => {
     try {
      const assignmentRef = doc(db, "salesmanCrmAssignments", salesman);
      await deleteDoc(assignmentRef);
      toast({ title: "Assignment Removed", description: `${salesman} is no longer assigned to a CRM handler.` });
    } catch (error) {
      console.error("Error removing assignment:", error);
      toast({ variant: "destructive", title: "Update Failed" });
    }
  }

  const getCrmUserName = (crmUserId: string) => {
    return crmUsers.find(user => user.id === crmUserId)?.name || "Unknown CRM";
  };

  if (loading) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-5 w-96" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salesman to CRM Assignments</CardTitle>
        <CardDescription>
          Assign a default CRM handler to each salesman. When a new order is created, it will be automatically assigned.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Salesman</TableHead>
              <TableHead>Assigned CRM Handler</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesmen.map((salesman) => {
              const assignedCrmId = assignments[salesman];
              return (
                <TableRow key={salesman}>
                  <TableCell className="font-medium">{salesman}</TableCell>
                  <TableCell>
                    {assignedCrmId ? (
                      <span className="font-semibold text-purple-600">{getCrmUserName(assignedCrmId)}</span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          {assignedCrmId ? 'Change' : 'Assign'} <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {crmUsers.map(user => (
                          <DropdownMenuItem key={user.id} onClick={() => handleAssign(salesman, user.id)}>
                            <Link className="mr-2 h-4 w-4" />
                            Assign to {user.name}
                          </DropdownMenuItem>
                        ))}
                        {assignedCrmId && (
                             <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleUnassign(salesman)}>
                                <Link2Off className="mr-2 h-4 w-4" />
                                Unassign
                             </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
