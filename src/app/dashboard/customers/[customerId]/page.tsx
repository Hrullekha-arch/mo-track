
import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/lib/types';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Settings, Archive, Receipt, FileText, CircleDollarSign } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from '@/components/ui/separator';

async function getCustomer(id: string): Promise<Customer | null> {
    try {
        const docRef = adminDb.collection('customers').doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists()) {
            const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
            return JSON.parse(JSON.stringify(customerData));
        } else {
            console.warn(`Customer document with ID ${id} not found in Firestore.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching customer by ID ${id}:`, error);
        return null;
    }
}

export default async function CustomerDetailPage({ params }: { params: { customerId: string }}) {
    const customer = await getCustomer(params.customerId);

    if (!customer) {
        notFound();
    }

    return (
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
                    <TabsTrigger value="archived"><Archive className="mr-2 h-4 w-4" />Archived</TabsTrigger>
                    <TabsTrigger value="receipts"><Receipt className="mr-2 h-4 w-4" />Receipts</TabsTrigger>
                    <TabsTrigger value="statement"><FileText className="mr-2 h-4 w-4" />Statement</TabsTrigger>
                </TabsList>
                <TabsContent value="deals" className="pt-4">
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <svg className="mx-auto h-24 w-24 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                        </svg>
                        <h3 className="text-xl font-semibold mb-2">There are no deals</h3>
                        <p className="text-muted-foreground mb-6">
                            There are no deals do you want to add deal? <br/>
                             <Link href="#" className="text-primary hover:underline">click here</Link> or click on New Deal button below
                        </p>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            New Deal
                        </Button>
                    </div>
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
    );
}
