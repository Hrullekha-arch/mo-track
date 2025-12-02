
"use client";

import { Deal, DealProduct, Selection } from "@/lib/types";
import { format } from "date-fns";
import Image from "next/image";

interface PrintableSelectionProps {
    selection: Selection;
    deal: Deal | null;
    products: DealProduct[];
}

export function PrintableSelection({ selection, deal, products }: PrintableSelectionProps) {
    
    // Filter the products based on the selection's productIds
    const selectedProducts = products.filter(p => selection.productIds?.includes(p.id!));
    console.log("Selected Products:", selectedProducts);

    const groupedProducts = selectedProducts.reduce((acc, product) => {
        const room = product.room || 'Unassigned';
        console.log(`Grouping product ${product.id} under room: ${room}`);
        if (!acc[room]) {
            acc[room] = [];
        }
        acc[room].push(product);
        return acc;
    }, {} as Record<string, DealProduct[]>);

    const grandTotalQty = selectedProducts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
    const grandTotalAmount = selectedProducts.reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.mrp) || 0)), 0);

    return (
        <div className="bg-white text-black p-4 font-sans text-xs">
            <header className="text-center mb-4">
                <h1 className="text-xl font-bold">Selection #{selection.id}</h1>
                <p className="text-sm text-gray-500">
                    Created by {selection.createdBy} on {format(new Date(selection.createdAt), "PPP")}
                </p>
                {deal && <p className="text-sm text-gray-500">Deal: {deal.dealName}</p>}
            </header>

            <div className="space-y-4">
                {Object.entries(groupedProducts).map(([room, roomProducts]) => {
                    const roomTotalAmount = roomProducts.reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.mrp) || 0)), 0);
                    const roomTotalItems = roomProducts.length;

                    return (
                        <div key={room}>
                            <h3 className="font-bold bg-gray-100 p-2 rounded-t-md">{room}</h3>
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b">
                                        <th className="p-1">Collection/Brand</th>
                                        <th className="p-1">MRP</th>
                                        <th className="p-1">Qty</th>
                                        <th className="p-1">No of Pcs</th>
                                        <th className="p-1">V-R</th>
                                        <th className="p-1">H-R</th>
                                        <th className="p-1">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roomProducts.map(p => (
                                        <tr key={p.id} className="border-b">
                                            <td className="p-1">{p.collectionBrand}</td>
                                            <td className="p-1">{p.mrp}</td>
                                            <td className="p-1">{p.quantity}</td>
                                            <td className="p-1">{p.noOfPcs}</td>
                                            <td className="p-1">{p.verticalRepeat}</td>
                                            <td className="p-1">{p.horizontalRepeat}</td>
                                            <td className="p-1">{p.remarks}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={6} className="text-right font-semibold p-1">Total MRP Per Room:</td>
                                        <td className="font-bold p-1">₹{roomTotalAmount.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={6} className="text-right font-semibold p-1">Total Items Per Room:</td>
                                        <td className="font-bold p-1">{roomTotalItems}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    );
                })}
            </div>

            <div className="text-right font-bold text-sm mt-4 border-t pt-2">
                <span className="mr-4">Grand Total Qty: {grandTotalQty.toFixed(2)}</span>
                <span>Grand Total: ₹{grandTotalAmount.toFixed(2)}</span>
            </div>
        </div>
    );
}
