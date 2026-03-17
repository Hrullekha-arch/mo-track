
"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Walkin_Customer, User } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Hand, Users, UserCheck, Trash, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/alert-dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { attendToWalkin, handoverToSalesman } from "./actions";
import { getSalesmen } from "../customers/actions";

export default function WalkinDataPage() {
    const [walkinData, setWalkinData] = useState<Walkin_Customer[]>([]);
    const [wentBackData, setWentBackData] = useState<Walkin_Customer[]>([]);
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    const isCrm = user?.designation === 'CRM';
    const isAdmin = user?.role === 'admin';
    const isSalesmanager = user?.designation === 'salesmanager';

    useEffect(() => {
    if (!user?.id) {
        setWalkinData([]);
        setLoading(false);
        return;
    }

    setLoading(true);

    // 🔹 build query based on role
    const q = isAdmin||isSalesmanager
        ? query(collection(db, "Walkin_Customer"))
        : query(
            collection(db, "Walkin_Customer"),
            where("createdById", "==", user.id)
        );
        console.log("User =",user.name);

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const data = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Walkin_Customer))
                .sort((a, b) => {
                    const at = new Date(a.createdAt || 0).getTime();
                    const bt = new Date(b.createdAt || 0).getTime();
                    return bt - at;
                });

            setWalkinData(data);
            setLoading(false);
        },
        (error) => {
            console.error("Error fetching walk-in data: ", error);
            toast({
                variant: "destructive",
                title: "Error Loading Data",
                description: "Could not fetch walk-in customer information.",
            });
            setLoading(false);
        }
    );

    const fetchSalesmen = async () => {
        const salesmenData = await getSalesmen();
        setSalesmen(salesmenData);
    };
    fetchSalesmen();

    return () => unsubscribe();
}, [toast, user?.id, user?.role]);

//=============================Went-back Data featch
    useEffect(() => {
    if (!user?.id) {
        setWalkinData([]);
        setLoading(false);
        return;
    }

    setLoading(true);

    // 🔹 build query based on role
    const q = isAdmin || isSalesmanager
        ? query(collection(db, "Walkin_Customer"))
        : query(
            collection(db, "Walkin_Customer"),
            where("status", "==", "went-back")
        );

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const data = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Walkin_Customer))
                .sort((a, b) => {
                    const at = new Date(a.createdAt || 0).getTime();
                    const bt = new Date(b.createdAt || 0).getTime();
                    return bt - at;
                });

            setWentBackData(data);
            setLoading(false);
        },
        (error) => {
            console.error("Error fetching walk-in data: ", error);
            toast({
                variant: "destructive",
                title: "Error Loading Data",
                description: "Could not fetch walk-in customer information.",
            });
            setLoading(false);
        }
    );

    const fetchSalesmen = async () => {
        const salesmenData = await getSalesmen();
        setSalesmen(salesmenData);
    };
    fetchSalesmen();

    return () => unsubscribe();
}, [toast, user?.id, user?.role]);

    const handleAttend = async (customerId: string) => {
        if (!user) return;
        setUpdatingId(customerId);
        try {
            const result = await attendToWalkin(customerId, { id: user.id, name: user.name });
            if (result.success) {
                toast({ title: "Success", description: "You are now attending this customer." });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const handleHandover = async (customerId: string, salesman: User) => {
         if (!user) return;
        setUpdatingId(customerId);
        try {
            const result = await handoverToSalesman(
                customerId,
                { id: salesman.id, name: salesman.name },
                { id: user.id, name: user.name }
            );
            if (result.success) {
                toast({ title: "Success", description: `Customer handed over to ${salesman.name}.` });
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } finally {
            setUpdatingId(null);
        }
    }
    
    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'Attended':
                return <Badge variant="default" className="bg-blue-500">Attended</Badge>;
            case 'Handed Over':
                return <Badge variant="default" className="bg-green-500">Handed Over</Badge>;
            default:
                return <Badge variant="secondary">Pending</Badge>;
        }
    }

    const formatLookingFor = (value?: string | string[]) => {
        if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "-";
        return value || "-";
    };
    //==================Delete Doc

        const deleteWalkinCustomer = async (id: string) => {
        try {
            await deleteDoc(doc(db, "Walkin_Customer", id));

            toast({
            title: "Customer deleted",
            description: "Walk-in customer removed successfully.",
            });

        } catch (error) {
            console.error("Delete error:", error);

            toast({
            variant: "destructive",
            title: "Delete failed",
            description: "Could not delete customer.",
            });
        }
        };

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Walk-in Customer Data</h1>
                <p className="text-muted-foreground">Information submitted through the public walk-in form.</p>
            </header>

            <Tabs defaultValue="account">
                <TabsList>
                    <TabsTrigger value="account">All Leads</TabsTrigger>
                    <TabsTrigger value="password">Went-Back</TabsTrigger>
                </TabsList>
                <TabsContent value="account">
            <Card >
                <CardContent className="pt-6">
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Mobile</TableHead>
                                    <TableHead>Looking For</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Attended By</TableHead>
                                    <TableHead>Handed To</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={8}>
                                                <Skeleton className="h-8 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : walkinData.length > 0 ? (
                                    walkinData.map(customer => (
                                        <TableRow key={customer.id}>
                                            <TableCell>{customer.createdAt ? format(new Date(customer.createdAt), 'PPP') : 'N/A'}</TableCell>
                                            <TableCell>{customer.firstName} {customer.familyName}</TableCell>
                                            <TableCell>{customer.mobile}</TableCell>
                                            <TableCell className="max-w-xs truncate">{formatLookingFor(customer.lookingFor)}</TableCell>
                                            <TableCell>{getStatusBadge(customer.status)}</TableCell>
                                            <TableCell>{customer.attendedBy?.name || '-'}</TableCell>
                                            <TableCell>{customer.salesmanName || '-'}</TableCell>
                                            <TableCell>
                                                {isCrm && (
                                                    <div className="flex gap-2">
                                                    {customer.status === 'Pending' && (
                                                        <Button size="sm" onClick={() => handleAttend(customer.id)} disabled={updatingId === customer.id}>
                                                            {updatingId === customer.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4"/>}
                                                            Attend
                                                        </Button>
                                                    )}
                                                    {customer.status === 'Attended' && customer.attendedBy?.id === user.id && (
                                                         <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button size="sm" variant="outline" disabled={updatingId === customer.id}>
                                                                    {updatingId === customer.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Users className="h-4 w-4"/>}
                                                                    Handover
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                {salesmen.map(s => (
                                                                    <DropdownMenuItem key={s.id} onSelect={() => handleHandover(customer.id, s)}>
                                                                        {s.name}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                    </div>
                                                )}
                                                {isAdmin && (
                                                    <div className="flex gap-2">
                                                    {customer.status === 'Pending' && (
                                                        <Button size="sm" onClick={() => handleAttend(customer.id)} disabled={updatingId === customer.id}>
                                                            {updatingId === customer.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4"/>}
                                                            Attend
                                                        </Button>
                                                    )}
                                                    {customer.status === 'Attended' && customer.attendedBy?.id === user.id && (
                                                         <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button size="sm" variant="outline" disabled={updatingId === customer.id}>
                                                                    {updatingId === customer.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Users className="h-4 w-4"/>}
                                                                    Handover
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                {salesmen.map(s => (
                                                                    <DropdownMenuItem key={s.id} onSelect={() => handleHandover(customer.id, s)}>
                                                                        {s.name}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="outline">
                                                                <Trash />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently delete this customer deatails from server.
                                                            </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={()=>deleteWalkinCustomer(customer.id)}>Continue</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                        </AlertDialog>
                                                        <Drawer>
                                                            <DrawerTrigger>
                                                                <Button>
                                                                    <Eye />
                                                                    View Details
                                                                </Button>
                                                            </DrawerTrigger>
                                                            <DrawerContent>
                                                                <DrawerHeader>
                                                                <DrawerTitle>Customer Details</DrawerTitle>
                                                                </DrawerHeader>
                                                                    <div>
                                                                        <Card className="p-10">
                                                                            <div>Date Of Creation: {customer.createdAt ? format(new Date(customer.createdAt), 'PPP') : 'N/A'}</div>
                                                                            <div> Customer Name: {customer.firstName} {customer.familyName}</div>
                                                                            <div>Customer phone No:{customer.mobile}</div>
                                                                            <div className="max-w-xs truncate"> Customer looking for: {formatLookingFor(customer.lookingFor)}</div>
                                                                            <div>Status: {getStatusBadge(customer.status)}</div>
                                                                            <div>Attend By: {customer.attendedBy?.name || '-'}</div>
                                                                            <div>HandOver To: {customer.salesmanName || '-'}</div>
                                                                        </Card>
                                                                    </div>
                                                                <DrawerFooter>
                                                                <Button>Submit</Button>
                                                                <DrawerClose>
                                                                    <Button variant="outline">Cancel</Button>
                                                                </DrawerClose>
                                                                </DrawerFooter>
                                                            </DrawerContent>
                                                         </Drawer>
                                                    </div>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            No walk-in data found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            </TabsContent>
                <TabsContent value="password">Change your password here.</TabsContent>
            </Tabs>

            
        </div>
    );
}
