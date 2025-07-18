
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { salesmen } from "@/lib/constants";
import { User, SalesmanCrmAssignment } from "@/lib/types";
import { collection, onSnapshot, query, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export function SalesmanCrmAssignments() {
    const [crmUsers, setCrmUsers] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<SalesmanCrmAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingSalesman, setUpdatingSalesman] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const usersQuery = query(collection(db, "users"));
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setCrmUsers(usersData.filter(u => u.designation === 'CRM'));
        });

        const assignmentsQuery = query(collection(db, "salesmanCrmAssignments"));
        const unsubscribeAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
            const assignmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesmanCrmAssignment));
            setAssignments(assignmentsData);
            setLoading(false);
        });

        return () => {
            unsubscribeUsers();
            unsubscribeAssignments();
        };
    }, []);

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
                    {salesmen.map((salesman) => (
                        <div key={salesman} className="flex items-center justify-between p-2 border rounded-lg">
                            <span className="font-medium">{salesman}</span>
                            <div className="flex items-center gap-2">
                                {updatingSalesman === salesman && <Loader2 className="h-5 w-5 animate-spin" />}
                                <Select
                                    value={getAssignedCrmId(salesman) || ""}
                                    onValueChange={(crmId) => handleAssignCrm(salesman, crmId)}
                                    disabled={updatingSalesman === salesman}
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
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
