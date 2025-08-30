
"use client";

import { Order, FabricDetail, VasDetail } from "@/lib/types";
import { format } from "date-fns";

interface PrintableOrderProps {
    order: Order;
}

const formatToINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

export function PrintableOrder({ order }: PrintableOrderProps) {

    const calculateItemSubtotal = (item: FabricDetail) => {
        return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
    };
    
    const calculateItemDiscount = (item: FabricDetail) => {
        const subtotal = calculateItemSubtotal(item);
        return subtotal * ((Number(item.discountPercent) || 0) / 100);
    };

    const calculateVasSubtotal = (vas: VasDetail) => {
        return (Number(vas.quantity) || 0) * (Number(vas.rate) || 0);
    }
    
    const itemSubtotal = (order.fabricDetails || []).reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
    const itemDiscount = (order.fabricDetails || []).reduce((sum, item) => sum + calculateItemDiscount(item), 0);
    const itemTaxable = itemSubtotal - itemDiscount;

    const vasTaxable = (order.vasDetails || []).reduce((sum, vas) => sum + calculateVasSubtotal(vas), 0);
    
    const totalTaxable = itemTaxable + vasTaxable;
    const cgst = totalTaxable * 0.025;
    const sgst = totalTaxable * 0.025;
    const grandTotal = totalTaxable + cgst + sgst;


    return (
        <div className="p-8 bg-white text-black font-sans text-sm">
            <header className="text-center mb-8">
                <h1 className="text-2xl font-bold">Sales Order</h1>
                <p className="text-muted-foreground">Order #{order.crmOrderNo}</p>
            </header>
            
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h2 className="font-bold mb-2">Customer:</h2>
                    <p>{order.customerName}</p>
                    <p>{order.customerAddress}</p>
                    <p>{order.customerPhone}</p>
                </div>
                 <div className="text-right">
                    <p><span className="font-bold">Order No:</span> {order.crmOrderNo}</p>
                    <p><span className="font-bold">Date:</span> {format(new Date(order.createdAt), "PPP")}</p>
                    <p><span className="font-bold">Sales Person:</span> {order.salesPerson}</p>
                </div>
            </div>

            <main>
                <h3 className="font-bold mb-2 text-lg">Items</h3>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-muted">
                            <th className="p-2 border">#</th>
                            <th className="p-2 border">Item</th>
                            <th className="p-2 border text-right">Qty</th>
                            <th className="p-2 border text-right">Rate</th>
                            <th className="p-2 border text-right">Discount</th>
                            <th className="p-2 border text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.fabricDetails || []).map((item, index) => (
                            <tr key={index}>
                                <td className="p-2 border">{index + 1}</td>
                                <td className="p-2 border">{item.fabricName}</td>
                                <td className="p-2 border text-right">{item.quantity}</td>
                                <td className="p-2 border text-right">{formatToINR(item.rate || 0)}</td>
                                <td className="p-2 border text-right">{formatToINR(calculateItemDiscount(item))} ({item.discountPercent || 0}%)</td>
                                <td className="p-2 border text-right font-semibold">{formatToINR(calculateItemSubtotal(item) - calculateItemDiscount(item))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                 {order.vasDetails && order.vasDetails.length > 0 && (
                    <>
                        <h3 className="font-bold mb-2 text-lg mt-6">Value Added Services</h3>
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="p-2 border">#</th>
                                    <th className="p-2 border">Service</th>
                                    <th className="p-2 border text-right">Qty</th>
                                    <th className="p-2 border text-right">Rate</th>
                                    <th className="p-2 border text-right">Subtotal</th>
                                </tr>
                            </thead>
                             <tbody>
                                {order.vasDetails.map((vas, index) => (
                                    <tr key={index}>
                                        <td className="p-2 border">{index + 1}</td>
                                        <td className="p-2 border">{vas.vasName}</td>
                                        <td className="p-2 border text-right">{vas.quantity}</td>
                                        <td className="p-2 border text-right">{formatToINR(Number(vas.rate) || 0)}</td>
                                        <td className="p-2 border text-right font-semibold">{formatToINR(calculateVasSubtotal(vas))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                 )}
            </main>
            
            <div className="grid grid-cols-2 gap-8 mt-8">
                <div>
                     {/* Can add terms here if needed */}
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between"><span>Subtotal (Items):</span> <span>{formatToINR(itemTaxable)}</span></div>
                    <div className="flex justify-between"><span>Subtotal (VAS):</span> <span>{formatToINR(vasTaxable)}</span></div>
                    <div className="flex justify-between"><span>CGST @2.5%:</span> <span>{formatToINR(cgst)}</span></div>
                    <div className="flex justify-between"><span>SGST @2.5%:</span> <span>{formatToINR(sgst)}</span></div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2"><span>Grand Total:</span> <span>{formatToINR(grandTotal)}</span></div>
                </div>
            </div>

        </div>
    );
}
