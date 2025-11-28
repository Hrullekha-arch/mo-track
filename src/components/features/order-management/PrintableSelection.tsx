import { Deal, Product, Selection } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface PrintableSelectionProps {
    selection: Selection;
    deal: Deal | null;
    products: Product[];
}

export function PrintableSelection({ selection, deal, products }: PrintableSelectionProps) {

    const calculateRoomTotals = (productIds: string[]) => {
        let totalMrp = 0;
        let totalItems = 0;

        productIds.forEach(productId => {
            const product = products.find(p => p.id === productId);
            if (product) {
                totalMrp += product.mrp;
                totalItems += 1; // Assuming qty is 1 for each product line
            }
        });

        return { totalMrp, totalItems };
    };

    const roomTotals = calculateRoomTotals(selection.productIds);

    //This is a placeholder for a grand total calculation
    const grandTotalQty = roomTotals.totalItems;
    const grandTotalAmount = roomTotals.totalMrp;

    return (
        <div className="bg-white text-black p-8 font-sans">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold">Selection #{selection.id.slice(-4)}</h1>
                <p className="text-sm text-gray-600">
                    Created by {deal?.salesmanName || 'admin'} on {new Date(selection.createdAt.seconds * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
            </div>

            <div className="mb-8">
                <Card className="border-none shadow-none">
                    <CardHeader className="px-2">
                        <CardTitle className="text-xl">{selection.room}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[150px] text-black font-semibold">Collection/Brand</TableHead>
                                    <TableHead className="text-black font-semibold">MRP</TableHead>
                                    <TableHead className="text-black font-semibold">Qty</TableHead>
                                    <TableHead className="text-black font-semibold">No of Pcs</TableHead>
                                    <TableHead className="text-black font-semibold">V-R</TableHead>
                                    <TableHead className="text-black font-semibold">H-R</TableHead>
                                    <TableHead className="text-black font-semibold">Remarks</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selection.productIds.map(productId => {
                                    const product = products.find(p => p.id === productId);
                                    if (!product) return null;

                                    return (
                                        <TableRow key={product.id}>
                                            <TableCell>{product.collection || 'N/A'}</TableCell>
                                            <TableCell>₹{product.mrp.toFixed(2)}</TableCell>
                                            <TableCell>1</TableCell> {/* Placeholder */}
                                            <TableCell>1</TableCell> {/* Placeholder */}
                                            <TableCell></TableCell> {/* Placeholder */}
                                            <TableCell></TableCell> {/* Placeholder */}
                                            <TableCell></TableCell> {/* Placeholder */}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        <div className="text-right mt-4 pr-4">
                            <p><strong>Total MRP Per Room:</strong> ₹{roomTotals.totalMrp.toFixed(2)}</p>
                            <p><strong>Total Items Per Room:</strong> {roomTotals.totalItems}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Separator className="my-4 bg-gray-300" />

            <div className="text-right font-bold text-lg">
                <span className="mr-8">Grand Total Qty: {grandTotalQty}</span>
                <span>Grand Total: ₹{grandTotalAmount.toFixed(2)}</span>
            </div>
        </div>
    );
}
