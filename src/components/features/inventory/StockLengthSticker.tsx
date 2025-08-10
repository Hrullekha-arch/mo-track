
"use client";

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import Image from 'next/image';

interface StockLengthStickerProps {
    bcn: string;
    itemName: string;
    length: number;
    poNumber: string;
    uniqueId: string; // A unique ID for this specific sticker, e.g., transactionId + index
}

// 72.2mm x 49.8mm sticker
const STICKER_WIDTH_PX = 272;
const STICKER_HEIGHT_PX = 188;

export function StockLengthSticker({ bcn, itemName, length, poNumber, uniqueId }: StockLengthStickerProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);
    const barcodeValue = `${bcn}-${uniqueId}`;

    useEffect(() => {
        if (barcodeRef.current) {
            try {
                JsBarcode(barcodeRef.current, barcodeValue, {
                    format: "CODE128",
                    width: 1.2,
                    height: 30,
                    displayValue: false, // We display it manually below
                    margin: 0,
                });
            } catch (e) {
                console.error(`Failed to generate barcode for value: ${barcodeValue}`, e);
            }
        }
    }, [barcodeValue]);

    return (
        <div 
            className="sticker-container border border-dashed border-gray-400 p-1 bg-white text-black flex flex-col justify-between"
            style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px`, fontFamily: 'sans-serif' }}
        >
            <div className="flex items-start justify-between">
                <div className="w-2/3">
                    <p className="text-[10px] font-bold leading-tight truncate">{itemName}</p>
                    <p className="text-[9px] leading-tight">PO: {poNumber}</p>
                </div>
                <Image src="/logo.png" alt="Logo" width={35} height={17} />
            </div>

            <div className='text-center my-1'>
                <p className="text-xl font-bold leading-none">{length.toFixed(2)} Mtr</p>
            </div>
            
            <div className="flex flex-col justify-center items-center">
                <svg ref={barcodeRef} className='w-full'></svg>
                <p className="text-[8px] font-mono tracking-wide">{barcodeValue}</p>
            </div>
        </div>
    );
}
