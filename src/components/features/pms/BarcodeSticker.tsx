
"use client";

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import Image from 'next/image';

interface BarcodeStickerProps {
    dealId: string;
    customerName: string;
    orderType: string;
}

// 72.1mm x 48.9mm at 96 DPI
const STICKER_WIDTH_PX = 272;
const STICKER_HEIGHT_PX = 185;

export function BarcodeSticker({ dealId, customerName, orderType }: BarcodeStickerProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (barcodeRef.current) {
            JsBarcode(barcodeRef.current, dealId, {
                format: "CODE128",
                width: 2,
                height: 50,
                displayValue: true,
                fontSize: 14,
                margin: 10,
            });
        }
    }, [dealId]);

    return (
        <div 
            className="sticker-container border border-dashed border-gray-400 p-2 bg-white text-black"
            style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px` }}
        >
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between border-b border-gray-300 pb-1">
                    <h1 className="text-xs font-bold">MoTrack PMS</h1>
                    <Image src="/logo.png" alt="Logo" width={50} height={25} />
                </div>
                <div className="flex-grow flex flex-col justify-around py-1">
                    <div>
                        <p className="text-xs">Customer:</p>
                        <p className="font-bold text-sm truncate">{customerName}</p>
                    </div>
                     <div>
                        <p className="text-xs">Order Type:</p>
                        <p className="font-bold text-sm">{orderType}</p>
                    </div>
                </div>
                <div className="flex justify-center items-center">
                    <svg ref={barcodeRef}></svg>
                </div>
            </div>
        </div>
    );
}
