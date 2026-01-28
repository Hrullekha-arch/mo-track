
"use client";

import React from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getSelectionById, uploadFileToStorageAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { processMeasurementSubmission } from "@/services/measurement-selection-middleware";

export default function SummaryPage() {
    const params = useParams();
    const visitId = params.visitId as string;

    const search = useSearchParams();
    const router = useRouter();

    const customerId = search.get("customerId")!;
    const dealId = search.get("dealId")!;
    const selectionId = search.get("selectionId")!;

    const [loading, setLoading] = React.useState(true);
    const [selection, setSelection] = React.useState<any>(null);
    const [processing, setProcessing] = React.useState(false);

    React.useEffect(() => {
        const load = async () => {
            try {
                const data = await getSelectionById(customerId, dealId, selectionId);
                setSelection(data);
            } catch (e) {
                toast({ variant: "destructive", title: "Error loading summary" });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const generatePdfAndUpload = async () => {
        const element = document.getElementById("summary-content");
        if (!element) throw new Error("No summary content found");

        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const ratio = pageWidth / canvas.width;

        const newHeight = canvas.height * ratio;
        pdf.addImage(imgData, "PNG", 0, 0, pageWidth, newHeight);

        const pdfBlob = pdf.output("blob");
        const pdfFile = new File([pdfBlob], `${visitId}-summary.pdf`, {
            type: "application/pdf"
        });

        return await uploadFileToStorageAction(
            pdfFile.name,
            pdfFile.type,
            await blobToBase64(pdfFile),
            "measurements/pdfs"
        );
    };

    const blobToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleFinalize = async () => {
        if (!selection) return;
        setProcessing(true);

        try {
            const pdfUrl = await generatePdfAndUpload();

            const roomsMap: any = {};

            selection.products.forEach((prod: any) => {
                const room = prod.room || "Room";
                if (!roomsMap[room]) roomsMap[room] = { blinds: [], items: [] };

                if (prod.isBlind) {
                    roomsMap[room].blinds.push(prod);
                } else {
                    roomsMap[room].items.push(prod);
                }
            });

            const payloadRooms = Object.entries(roomsMap).map(([roomName, data]: any) => ({
                roomName,
                blinds: data.blinds,
                entries: data.items
            }));

            const result = await processMeasurementSubmission({
                dealId,
                selectionId,
                rooms: payloadRooms,
                itemDetails: [],
                createdBy: "installer" // you can replace with user.name
            });

            if (result.success) {
                toast({ title: "Measurement Saved", description: "Done successfully!" });
                router.push("/mobile");
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <p className="p-4">Loading summary…</p>;

    if (!selection) return <p>No summary available.</p>;

    const rooms: any = {};
    selection.products.forEach((p: any) => {
        const room = p.room || "Room";
        if (!rooms[room]) rooms[room] = { blinds: [], items: [] };
        if (p.isBlind) rooms[room].blinds.push(p);
        else rooms[room].items.push(p);
    });

    return (
        <div className="p-4">
            <header className="flex items-center gap-2 mb-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft />
                </Button>
                <h1 className="text-xl font-bold">Summary</h1>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Measurement Summary</CardTitle>
                </CardHeader>

                <CardContent id="summary-content" className="space-y-6">
                    {Object.entries(rooms).map(([roomName, data]: any) => (
                        <div key={roomName} className="border-b pb-4">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="font-bold text-lg">{roomName}</h2>

                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            router.push(
                                                `/mobile/measurement/${visitId}/items?room=${roomName}&customerId=${customerId}&dealId=${dealId}&selectionId=${selectionId}`
                                            )
                                        }
                                    >
                                        <Edit className="h-4 w-4 mr-1" />
                                        Edit Items
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            router.push(
                                                `/mobile/measurement/${visitId}/blinds?room=${roomName}&customerId=${customerId}&dealId=${dealId}&selectionId=${selectionId}`
                                            )
                                        }
                                    >
                                        <Edit className="h-4 w-4 mr-1" />
                                        Edit Blinds
                                    </Button>
                                </div>
                            </div>

                            {/* ITEMS */}
                            {data.items.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="font-semibold mb-2">Items</h3>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                        {data.items.map((item: any) => (
                                            <li key={item.id}>
                                                <strong>{item.salesDescription}</strong>{" "}
                                                {item.height && `H: ${item.height}`}{" "}
                                                {item.width && ` W: ${item.width}`}
                                                {item.noOfPcs && ` | Panels: ${item.noOfPcs}`}
                                                {item.noOfSeat && ` | Seats: ${item.noOfSeat}`}
                                                {item.fabricQty1 && ` | Fabric: ${item.fabricQty1}`}
                                                {item.stitchingRate && ` | stitching: ${item.stitchingRate}`}

                                                {/* Additional */}
                                                {(item.foam || item.casement || item.marking || item.niwar) && (
                                                    <div className="ml-4 text-xs text-muted-foreground">
                                                        {item.foam && (
                                                            <p>
                                                                Foam: {item.foam.foamSize} /
                                                                {item.foam.qty} /
                                                                {item.foam.density}
                                                            </p>
                                                        )}
                                                        {item.casement && <p>Casement: {item.casement.qty}</p>}
                                                        {item.marking && <p>Marking: {item.marking.qty}</p>}
                                                        {item.niwar && <p>Niwar: {item.niwar.qty}</p>}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* BLINDS */}
                            {data.blinds.length > 0 && (
                                <div>
                                    <h3 className="font-semibold mb-2">Blinds</h3>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                        {data.blinds.map((blind: any) => (
                                            <li key={blind.id}>
                                                <strong>{blind.blindType}</strong>
                                                {blind.width && ` | W: ${blind.width}`}
                                                {blind.height && ` | H: ${blind.height}`}
                                                {blind.control && ` | Control: ${blind.control}`}
                                                {blind.noOfBlind && ` | Qty: ${blind.noOfBlind}`}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="mt-6">
                <Button
                    className="w-full"
                    onClick={handleFinalize}
                    disabled={processing}
                >
                    {processing && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                    Confirm & Save Measurement
                </Button>
            </div>
        </div>
    );
}
