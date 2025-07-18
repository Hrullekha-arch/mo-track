
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { User } from '@/lib/types';
import { collection, onSnapshot, doc, deleteDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2Off, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const salesmen = [
    "AAS (SAHOO)", "ASD (SAROJ DAS)", "ASB (ABHISHEK SINGH)", "AK (ABHISHEK CARPET)",
    "AM (MINTOO)", "BPS (PAWAN SHARMA)", "BTK (TAPESHWAR)", "CAY (ASHISH)",
    "CP (PRADEEP)", "DS (DAYAL)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "MU (MURARI)",
    "NK (NAND KISHOR)", "NKD (NEERAJ)", "RA (RAJEEV AGGARWAL)", "RSB (RAJENDRA BISHT)",
    "RK (RAJKUMAR)", "SD (SWETA)", "UMDP (UMESH)", "RD (Bhatiya)", "ANVR (Anvar)", "VD (Vishal Dubey)"
];

export function SalesmanAssignment() {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [crmUsers, setCrmUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedCrm, setSelectedCrm] = useState<string>("");
  const [selectedSalesmen, setSelectedSalesmen] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    const assignmentsCollection = collection(db, "salesmanCrmAssignments");
    const unsubscribeAssignments = onSnapshot(assignmentsCollection, (snapshot) => {
      const assignmentsData: Record<string, string> = {};
      snapshot.forEach(doc => {
        assignmentsData[doc.id] = doc.data().crmUserId;
      });
      setAssignments(assignmentsData);
    });

    const crmQuery = query(collection(db, "users"), where("designation", "==", "CRM"));
    const unsubscribeCrmUsers = onSnapshot(crmQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setCrmUsers(usersData);
    });

    setLoading(false);

    return () => {
        unsubscribeAssignments();
        unsubscribeCrmUsers();
    };
  }, []);
  
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

  const handleBulkAssign = async () => {
    if (!selectedCrm) {
        toast({ variant: "destructive", title: "No CRM Selected", description: "Please select a CRM handler from the dropdown." });
        return;
    }

    const salesmenToAssign = Object.keys(selectedSalesmen).filter(s => selectedSalesmen[s]);

    if (salesmenToAssign.length === 0) {
        toast({ variant: "destructive", title: "No Salesmen Selected", description: "Please check the boxes next to the salesmen you want to assign." });
        return;
    }

    setAssigning(true);
    try {
        const batch = writeBatch(db);
        salesmenToAssign.forEach(salesman => {
            const docRef = doc(db, "salesmanCrmAssignments", salesman);
            batch.set(docRef, { crmUserId: selectedCrm });
        });
        await batch.commit();

        toast({ title: "Assignments Successful", description: `${salesmenToAssign.length} salesmen have been assigned.` });
        setSelectedCrm("");
        setSelectedSalesmen({});

    } catch (error) {
        console.error("Error bulk assigning:", error);
        toast({ variant: "destructive", title: "Assignment Failed", description: "An error occurred while assigning salesmen." });
    } finally {
        setAssigning(false);
    }
  }

  const getCrmUserName = (crmUserId: string) => {
    return crmUsers.find(user => user.id === crmUserId)?.name || "Unknown CRM";
  };

  const unassignedSalesmen = salesmen.filter(s => !assignments[s]);

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
    <div className='space-y-6'>
    <Card>
      <CardHeader>
        <CardTitle>Bulk Assign Salesmen</CardTitle>
        <CardDescription>
          Quickly assign multiple unassigned salesmen to a CRM handler.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor='crm-select'>1. Select a CRM Handler</Label>
            <Select value={selectedCrm} onValueChange={setSelectedCrm}>
                <SelectTrigger id="crm-select">
                    <SelectValue placeholder="Choose a CRM handler..." />
                </SelectTrigger>
                <SelectContent>
                    {crmUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                            {user.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div className="space-y-2">
            <Label>2. Select Unassigned Salesmen</Label>
            {unassignedSalesmen.length > 0 ? (
                 <Card className="max-h-60 overflow-y-auto">
                    <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {unassignedSalesmen.map(salesman => (
                             <div key={salesman} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={salesman}
                                    checked={!!selectedSalesmen[salesman]}
                                    onCheckedChange={(checked) => {
                                        setSelectedSalesmen(prev => ({...prev, [salesman]: !!checked}))
                                    }}
                                />
                                <Label htmlFor={salesman} className="font-normal cursor-pointer">{salesman}</Label>
                            </div>
                        ))}
                    </CardContent>
                 </Card>
            ): (
                <div className="text-center p-8 border-2 border-dashed rounded-lg">
                    <p className="font-semibold">All salesmen are assigned!</p>
                    <p className="text-sm text-muted-foreground">No unassigned salesmen available.</p>
                </div>
            )}
        </div>
      </CardContent>
      <CardFooter>
          <Button onClick={handleBulkAssign} disabled={assigning}>
            {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign Selected
          </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Current Assignments</CardTitle>
        <CardDescription>
          View and manage existing salesman-to-CRM assignments.
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
            {Object.keys(assignments).length > 0 ? Object.entries(assignments).map(([salesman, crmUserId]) => {
              return (
                <TableRow key={salesman}>
                  <TableCell className="font-medium">{salesman}</TableCell>
                  <TableCell>
                    {crmUserId ? (
                      <span className="font-semibold text-purple-600">{getCrmUserName(crmUserId)}</span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                     <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50" onClick={() => handleUnassign(salesman)}>
                        <Link2Off className="mr-2 h-4 w-4" />
                        Unassign
                     </Button>
                  </TableCell>
                </TableRow>
              );
            }) : (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                        No assignments found.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </div>
  );
}
