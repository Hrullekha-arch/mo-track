
"use client";

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import Image from 'next/image';
import { Order } from '@/lib/types';

interface BarcodeStickerProps {
    dealId: string;
    customerName: string;
    salesman: string;
    orderType: string;
    items: { name: string; quantity: string; unit: string; }[];
}

// 72.1mm x 48.9mm at 96 DPI
const STICKER_WIDTH_PX = 272;
const STICKER_HEIGHT_PX = 185;

export function BarcodeSticker({ dealId, customerName, salesman, orderType, items }: BarcodeStickerProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (barcodeRef.current) {
            JsBarcode(barcodeRef.current, dealId, {
                format: "CODE128",
                width: 1.5,
                height: 35,
                displayValue: true,
                fontSize: 12,
                margin: 5,
            });
        }
    }, [dealId]);

    return (
        <div 
            className="sticker-container border border-dashed border-gray-400 p-1 bg-white text-black flex flex-col"
            style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px`, fontFamily: 'sans-serif' }}
        >
            <div className="flex items-center justify-between border-b border-gray-300 pb-1 px-1">
                <div>
                    <h1 className="text-xs font-bold leading-tight">MoTrack PMS</h1>
                    <p className="text-[10px] leading-tight">{customerName}</p>
                </div>
                <Image src="/logo.png" alt="Logo" width={40} height={20} />
            </div>

            <div className="flex-grow flex text-xs pt-1 px-1">
                <div className="w-1/2 pr-1 border-r border-gray-300">
                    <p className="text-[10px]">Salesman: <span className="font-bold">{salesman}</span></p>
                    <p className="text-[10px]">Type: <span className="font-bold">{orderType}</span></p>
                </div>
                 <div className="w-1/2 pl-1">
                     <p className="text-[10px] font-bold">Items:</p>
                     <ul className="text-[9px] leading-tight space-y-0.5">
                        {items.slice(0, 3).map((item, index) => ( // Limit to 3 items to fit
                            <li key={index} className="flex justify-between">
                                <span className="truncate max-w-[80px]">{item.name}</span>
                                <span className="font-bold whitespace-nowrap pl-1">{item.quantity} {item.unit}</span>
                            </li>
                        ))}
                     </ul>
                </div>
            </div>
            
            <div className="flex justify-center items-end">
                <svg ref={barcodeRef}></svg>
            </div>
        </div>
    );
}
