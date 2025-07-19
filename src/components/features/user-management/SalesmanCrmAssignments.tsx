
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, SalesmanCrmAssignment } from "@/lib/types";
import { collection, onSnapshot, query, doc, setDoc, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export function SalesmanCrmAssignments() {
    const [crmUsers, setCrmUsers] = useState<User[]>([]);
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<SalesmanCrmAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingSalesman, setUpdatingSalesman] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const crmQuery = query(collection(db, "users"), where("designation", "==", "CRM"));
        const salesmenQuery = query(collection(db, "users"), where("role", "==", "salesman"));
        const assignmentsQuery = query(collection(db, "salesmanCrmAssignments"));

        const fetchData = async () => {
            try {
                const [crmSnapshot, salesmenSnapshot, assignmentsSnapshot] = await Promise.all([
                    getDocs(crmQuery),
                    getDocs(salesmenQuery),
                    getDocs(assignmentsQuery)
                ]);

                const crmData = crmSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
                setCrmUsers(crmData);

                const salesmenData = salesmenSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
                setSalesmen(salesmenData);

                const assignmentsData = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesmanCrmAssignment));
                setAssignments(assignmentsData);

            } catch (error) {
                console.error("Error fetching initial assignments data:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not load assignments data."
                });
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const unsubscribeCrm = onSnapshot(crmQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setCrmUsers(usersData);
        });

        const unsubscribeSalesmen = onSnapshot(salesmenQuery, (snapshot) => {
            const salesmenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setSalesmen(salesmenData);
        });

        const unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
            const assignmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesmanCrmAssignment));
            setAssignments(assignmentsData);
        });


        return () => {
            unsubscribeCrm();
            unsubscribeSalesmen();
            unsubscribeAssignments();
        };
    }, [toast]);

    const handleAssignCrm = async (salesmanName: string, crmUserId: string) => {
        setUpdatingSalesman(salesmanName);
        try {
            const assignmentRef = doc(db, "salesmanCrmAssignments", salesmanName);
            await setDoc(assignmentRef, { crmUserId });
            toast({
                title: "Assignment Updated",
                description: `${salesmanName} has been assigned to a new CRM handler.`,
            });
        } catch (error) {
            console.error("Error updating assignment:", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "Could not update the assignment.",
            });
        } finally {
            setUpdatingSalesman(null);
        }
    };

    const getAssignedCrmId = (salesmanName: string) => {
        return assignments.find(a => a.id === salesmanName)?.crmUserId;
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Assign Salesmen to CRM</CardTitle>
                <CardDescription>
                    For each salesman, select the CRM handler who will manage their orders. This assignment is used when new orders are created.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {salesmen.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No salesmen found. Add users with the 'salesman' role to see them here.
                        </p>
                    ) : crmUsers.length === 0 ? (
                         <p className="text-sm text-muted-foreground text-center py-4">
                            No CRM handlers found. Add users with the 'CRM' designation to assign them.
                        </p>
                    ) : (
                        salesmen.sort((a, b) => a.name.localeCompare(b.name)).map((salesman) => (
                            <div key={salesman.id} className="flex items-center justify-between p-2 border rounded-lg">
                                <span className="font-medium">{salesman.name}</span>
                                <div className="flex items-center gap-2">
                                    {updatingSalesman === salesman.name && <Loader2 className="h-5 w-5 animate-spin" />}
                                    <Select
                                        value={getAssignedCrmId(salesman.name) || ""}
                                        onValueChange={(crmId) => handleAssignCrm(salesman.name, crmId)}
                                        disabled={updatingSalesman === salesman.name}
                                    >
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select CRM Handler" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {crmUsers.map((crm) => (
                                                <SelectItem key={crm.id} value={crm.id}>
                                                    {crm.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
