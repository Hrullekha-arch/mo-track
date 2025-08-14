
"use client";

import { useState, useEffect } from "react";
import { collectionGroup, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, Clock, MapPin, GanttChartSquare, Phone, ArrowRight, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { measurementItems, subMeasurementBlinds, subMeasurementCurtain, deliveryInstallationItems, subDeliveryInstallationItems } from "@/app/dashboard/customers/[customerId]/[dealId]/page";


interface EnrichedInstallerVisit extends DealVisit {
    customer: Customer | null;
    deal: Deal | null;
    dealDocId: string;
}

const VisitDetailsDialog = ({ visit, isOpen, onClose }: { visit: EnrichedInstallerVisit | null, isOpen: boolean, onClose: () => void }) => {
    if (!visit) return null;

    const renderMeasurementDetails = (v: DealVisit) => (
      <div className="space-y-4">
          <div>
              <h4 className="font-semibold text-sm">Measurements Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground text-sm pl-4 mt-1">
                  {(v.measurements && v.measurements.length > 0) ? v.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
              </ul>
          </div>
          {v.blinds && v.blinds.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Blind Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm pl-4 mt-1">
                      {v.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                  </ul>
              </div>
          )}
          {v.curtain && v.curtain.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Curtain Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm pl-4 mt-1">
                      {v.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                      {v.otherCurtain && <li>Other: {v.otherCurtain}</li>}
                  </ul>
              </div>
          )}
      </div>
    );

    const renderDeliveryDetails = (v: DealVisit) => (
      <div className="space-y-4">
          <div>
              <h4 className="font-semibold text-sm">Delivery/Installation Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground text-sm pl-4 mt-1">
                  {(v.deliveryInstallations && v.deliveryInstallations.length > 0) ? 
                      v.deliveryInstallations.map(d => d && <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                      : <li>None</li>}
                  {v.otherDelivery && <li>Other: {v.otherDelivery}</li>}
              </ul>
          </div>
          {v.subDeliveryInstallations && v.subDeliveryInstallations.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Sub-Delivery/Installation:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm pl-4 mt-1">
                      {v.subDeliveryInstallations.map(d => d && <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
                  </ul>
              </div>
          )}
      </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Visit Details</DialogTitle>
                    <DialogDescription>
                        Details for visit on {format(new Date(visit.dueDate), 'PPP p')}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {visit.typeOfVisit === 'measurement'
                        ? renderMeasurementDetails(visit)
                        : renderDeliveryDetails(visit)}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export function InstallerVisitsList({ installerId }: { installerId: string }) {
    const [visits, setVisits] = useState<EnrichedInstallerVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVisit, setSelectedVisit] = useState<EnrichedInstallerVisit | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const visitsQuery = query(
            collectionGroup(db, "visits"),
            where("assignedTo", "==", installerId)
        );

        const unsubscribe = onSnapshot(visitsQuery, async (snapshot) => {
            const customerCache = new Map<string, Customer>();
            const dealCache = new Map<string, Deal>();
            
            const visitsDataPromises = snapshot.docs
              .filter(docSnap => docSnap.data().status !== 'completed') // Filter out completed visits
              .map(async (docSnap) => {
                const visit = docSnap.data() as DealVisit;
                const pathParts = docSnap.ref.path.split('/');
                const customerId = pathParts[1];
                const dealDocId = pathParts[3];

                let customerData: Customer | null = customerCache.get(customerId) || null;
                if (!customerData) {
                    const customerRef = doc(db, 'customers', customerId);
                    const customerSnap = await getDoc(customerRef);
                    if (customerSnap.exists()) {
                        customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;
                        customerCache.set(customerId, customerData);
                    }
                }
                
                const dealCacheKey = `${customerId}-${dealDocId}`;
                let dealData: Deal | null = dealCache.get(dealCacheKey) || null;
                if (!dealData) {
                     const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                     const dealSnap = await getDoc(dealRef);
                     if (dealSnap.exists()) {
                        dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
                        dealCache.set(dealCacheKey, dealData);
                    }
                }

                return {
                    ...visit,
                    id: docSnap.id,
                    customer: customerData,
                    deal: dealData,
                    dealDocId: dealDocId,
                };
            });
            
            const visitsData = await Promise.all(visitsDataPromises);

            setVisits(visitsData.sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching installer visits: ", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch assigned visits." });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [installerId, toast]);

    if (loading) {
        return (
            <div className="p-4 space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
        <>
        <div className="p-4 space-y-4">
             <header className="mb-4">
                <h1 className="text-2xl font-bold">Assigned Visits</h1>
                <p className="text-muted-foreground">Your scheduled measurement and installation visits.</p>
            </header>
            {visits.length > 0 ? (
                visits.map(visit => (
                    <Card key={visit.id}>
                        <CardHeader className="flex flex-row justify-between items-start">
                            <div>
                                <CardTitle className="capitalize">{visit.customer?.name || "Unknown Customer"}</CardTitle>
                                <CardDescription>
                                    {visit.typeOfVisit} visit for Deal #{visit.deal?.dealId || 'N/A'}
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedVisit(visit)}>
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <p className="flex items-center gap-2 font-semibold"><Calendar className="h-4 w-4 text-muted-foreground" /> <span>{format(new Date(visit.dueDate), 'PPP p')}</span></p>
                             <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {visit.customer?.mobileNo || 'N/A'}</p>
                             <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {visit.customer?.addressPinCode || visit.customer?.city || 'N/A'}</p>
                        </CardContent>
                         {visit.typeOfVisit === 'measurement' && (
                            <CardFooter>
                                <Button asChild className="w-full">
                                    <Link href={`/mobile/measurement/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customer?.id}`}>
                                        Start Measurement
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </CardFooter>
                         )}
                    </Card>
                ))
            ) : (
                <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                    <p>No visits assigned to you yet.</p>
                </div>
            )}
        </div>
        <VisitDetailsDialog
            isOpen={!!selectedVisit}
            onClose={() => setSelectedVisit(null)}
            visit={selectedVisit}
        />
        </>
    )
}
