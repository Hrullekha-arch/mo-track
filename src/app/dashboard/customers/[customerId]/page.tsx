
"use client";

import { useEffect, useState, use } from "react";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlusCircle, Settings, Archive, Receipt, FileText, CircleDollarSign, Edit, Trash2, Loader2, Contact2 } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { NewDealDialog } from "@/components/features/customer/NewDealDialog";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getDealsForCustomer, getSalesmen } from '../actions';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { roomOptions } from "./[dealId]/page";


const itemSchema = z.object({
  itemName: z.string().optional(),
  type: z.string().optional(),
  qty: z.string().optional(),
  rate: z.string().optional(),
  dis: z.string().optional(),
  gst: z.string().optional(),
  amount: z.string().optional(),
});

const roomSchema = z.object({
  room: z.string().optional(),
  items: z.array(itemSchema),
});

const cpdSchema = z.object({
  representative: z.string().optional(),
  customerName: z.string().optional(),
  telNo: z.string().optional(),
  date: z.string().optional(),
  rooms: z.array(roomSchema),
});

type CpdFormValues = z.infer<typeof cpdSchema>;

function CpdForm({ customer, salesmen }: { customer: Customer, salesmen: User[] }) {
    const form = useForm<CpdFormValues>({
        resolver: zodResolver(cpdSchema),
        defaultValues: {
            customerName: customer.name,
            telNo: customer.mobileNo,
            date: format(new Date(), "yyyy-MM-dd"),
            rooms: [{ room: "", items: [{}] }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "rooms"
    });

    return (
        <Card>
            <CardContent className="pt-6">
                <FormProvider {...form}>
                    <form className="space-y-6">
                        {/* Top section */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="representative"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Representative</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Salesman" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="customerName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Customer Name</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="telNo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tele. No</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date</FormLabel>
                                        <FormControl><Input type="date" {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Separator />

                        {/* Rooms Section */}
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <RoomFields key={field.id} roomIndex={index} onRemoveRoom={() => remove(index)} />
                            ))}
                        </div>

                         <Button type="button" onClick={() => append({ room: "", items: [{}] })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Another Room
                        </Button>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

function RoomFields({ roomIndex, onRemoveRoom }: { roomIndex: number, onRemoveRoom: () => void }) {
    const { control } = useForm<CpdFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items`
    });

    return (
        <Card className="p-4 bg-muted/30">
            <div className="flex justify-between items-center mb-4">
                 <FormField
                    control={control}
                    name={`rooms.${roomIndex}.room`}
                    render={({ field }) => (
                        <FormItem className="w-1/3">
                            <FormLabel>Room</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select Room" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {roomOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />
                 <Button type="button" variant="destructive" size="sm" onClick={onRemoveRoom}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remove Room
                </Button>
            </div>
            
             <div className="space-y-2">
                {fields.map((item, itemIndex) => (
                    <div key={item.id} className="p-3 border rounded-md bg-background flex items-end gap-2">
                        <div className="grid grid-cols-2 gap-2 flex-grow">
                             <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.itemName`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs">Item Name</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.type`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs">Type</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-2 flex-grow">
                             <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.qty`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Qty</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.rate`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Rate</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.dis`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Dis%</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.gst`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Gst%</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                        </div>
                        <FormField
                            control={control}
                            name={`rooms.${roomIndex}.items.${itemIndex}.amount`}
                            render={({ field }) => ( <FormItem><FormLabel className="text-xs">Amount</FormLabel><FormControl><Input {...field} readOnly /></FormControl></FormItem> )}
                        />

                         <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => remove(itemIndex)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
             </div>
             <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({})}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
        </Card>
    );
}


export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
    const params = use(paramsPromise);
    const { customerId } = params;
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isNewDealOpen, setIsNewDealOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [customerData, dealsData, salesmenData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealsForCustomer(customerId),
                    getSalesmen(),
                ]);

                if (customerData) {
                    setCustomer(customerData);
                    setDeals(dealsData);
                    setSalesmen(salesmenData);
                } else {
                    setCustomer(null);
                    toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: 'Customer could not be found.'
                    })
                }
            } catch (error) {
                console.error("Error fetching customer page data:", error);
                 toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to fetch customer details.'
                })
            } finally {
                 setLoading(false);
            }
        };

        if (customerId) {
            fetchInitialData();
        }
    }, [customerId, toast]);

    const handleNewDealSuccess = (newDeal: Deal) => {
        setDeals(prevDeals => [newDeal, ...prevDeals]);
        toast({ title: "Deal Created!", description: "The new deal has been successfully added."});
        setIsNewDealOpen(false);
    }

    if (loading) {
        return (
            <div className="p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-48" />
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-48 col-span-1" />
                    <Skeleton className="h-48 col-span-1" />
                    <Skeleton className="h-48 col-span-1" />
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="p-4 md:p-6 lg:p-8 text-center">
                <h1 className="text-2xl font-bold">Customer not found</h1>
                <p>The requested customer could not be found.</p>
                 <Button variant="link" asChild className="mt-4">
                    <Link href="/dashboard/customers">Go back to customer search</Link>
                </Button>
            </div>
        )
    }

    const getSalesmanName = (id?: string) => salesmen.find(s => s.id === id)?.name || "N/A";

    return (
        <>
        <div className="p-4 md:p-6 lg:p-8">
            <header className="flex justify-between items-start mb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{customer.name}</h1>
                        <Button variant="ghost" size="icon"><Settings className="h-5 w-5 text-muted-foreground" /></Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Mobile: {customer.mobileNo} {customer.email && `| Email: ${customer.email}`}</p>
                </div>
                 <Button variant="outline" asChild>
                    <Link href="/dashboard/customers">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Customers
                    </Link>
                </Button>
            </header>

            <Separator className="my-4" />

             <Tabs defaultValue="deals" className="w-full">
                <TabsList>
                    <TabsTrigger value="deals"><CircleDollarSign className="mr-2 h-4 w-4" />Deals</TabsTrigger>
                    <TabsTrigger value="cpd"><Contact2 className="mr-2 h-4 w-4" />CPD</TabsTrigger>
                    <TabsTrigger value="archived"><Archive className="mr-2 h-4 w-4" />Archived</TabsTrigger>
                    <TabsTrigger value="receipts"><Receipt className="mr-2 h-4 w-4" />Receipts</TabsTrigger>
                    <TabsTrigger value="statement"><FileText className="mr-2 h-4 w-4" />Statement</TabsTrigger>
                </TabsList>
                <TabsContent value="deals" className="pt-4">
                    {deals.length > 0 ? (
                        <div className="space-y-4">
                             <div className="flex justify-end">
                                <Button onClick={() => setIsNewDealOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    New Deal
                                </Button>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {deals.map(deal => (
                                    <Link key={deal.id} href={`/dashboard/customers/${customerId}/${deal.id}`} className="block">
                                    <Card className="h-full hover:shadow-lg transition-shadow">
                                        <CardHeader>
                                            <CardTitle className="flex justify-between items-start">
                                                <span>{deal.dealName}</span>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Edit className="h-4 w-4"/></Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                                                </div>
                                            </CardTitle>
                                            <div className="text-sm text-muted-foreground">
                                                <Badge variant="secondary">
                                                    ID: {deal.dealId}
                                                </Badge>
                                                 <Badge variant="outline" className="ml-2">
                                                    {getSalesmanName(deal.representativeId)}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-2xl font-bold text-primary">₹{Number(deal.dealAmount).toLocaleString('en-IN')}</p>
                                            <p className="text-sm text-muted-foreground">{deal.description}</p>
                                        </CardContent>
                                    </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                            <svg className="mx-auto h-24 w-24 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                            </svg>
                            <h3 className="text-xl font-semibold mb-2">There are no deals</h3>
                            <p className="text-muted-foreground mb-6">
                                There are no deals do you want to add deal? <br/>
                                <button onClick={() => setIsNewDealOpen(true)} className="text-primary hover:underline">click here</button> or click on New Deal button below
                            </p>
                            <Button onClick={() => setIsNewDealOpen(true)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                New Deal
                            </Button>
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="cpd" className="pt-4">
                    <CpdForm customer={customer} salesmen={salesmen} />
                </TabsContent>
                 <TabsContent value="archived">
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Archived deals will appear here.</p>
                    </div>
                 </TabsContent>
                 <TabsContent value="receipts">
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Receipts will appear here.</p>
                    </div>
                 </TabsContent>
                 <TabsContent value="statement">
                     <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Statements will appear here.</p>
                    </div>
                 </TabsContent>
            </Tabs>
        </div>
        <NewDealDialog
            isOpen={isNewDealOpen}
            onClose={() => setIsNewDealOpen(false)}
            onSuccess={handleNewDealSuccess}
            customerId={customer.id}
            salesmen={salesmen}
        />
        </>
    );
    
