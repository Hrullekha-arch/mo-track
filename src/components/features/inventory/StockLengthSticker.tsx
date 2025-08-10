
"use client";

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import Image from 'next/image';
import { Stock } from '@/lib/types';

interface StockLengthStickerProps {
    stock: Stock;
    length: number;
    uniqueId: string; // A unique ID for this specific sticker, e.g., transactionId + index
}

// 72.2mm x 49.8mm sticker
const STICKER_WIDTH_PX = 272;
const STICKER_HEIGHT_PX = 188;

export function StockLengthSticker({ stock, length, uniqueId }: StockLengthStickerProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);
    const barcodeValue = `${stock.bcn}-${uniqueId}`;

    useEffect(() => {
        if (barcodeRef.current) {
            try {
                JsBarcode(barcodeRef.current, barcodeValue, {
                    format: "CODE128",
                    width: 1.2,
                    height: 30,
                    displayValue: false,
                    margin: 0,
                });
            } catch (e) {
                console.error(`Failed to generate barcode for value: ${barcodeValue}`, e);
            }
        }
    }, [barcodeValue]);

    return (
        <div 
            className="sticker-container border border-dashed border-gray-400 p-2 bg-white text-black flex flex-col justify-between"
            style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px`, fontFamily: 'sans-serif' }}
        >
            {/* Top Section */}
            <div className="flex justify-between items-start">
                <div style={{ width: '60px', height: '60px', border: '1px solid #333', borderRadius: '8px' }} className="flex items-center justify-center">
                    <Image src="/logo.png" alt="Logo" width={50} height={50} />
                </div>
                <div className="flex-grow text-center">
                    <div style={{ width: '40px', height: '40px', border: '1px solid #333', borderRadius: '50%' }} className="mx-auto flex flex-col items-center justify-center">
                         <span className="text-[9px] leading-none">Rack</span>
                         <span className="text-xs font-bold leading-none">{stock.rack || 'N/A'}</span>
                    </div>
                    <p className="text-[10px] font-bold leading-tight mt-1">MO DESIGN PVT LTD</p>
                    <p className="text-[9px] leading-tight">Contact number</p>
                </div>
            </div>

            {/* Middle Section */}
            <div className='text-center my-2 space-y-1'>
                <p className="text-xs">MRP: <span className="font-bold">{stock.mrp?.toFixed(2) || 'N/A'}</span></p>
                <p className="text-xs">BCN: <span className="font-bold">{stock.bcn || 'N/A'}</span></p>
            </div>
            
            {/* Bottom Section */}
            <div className="flex flex-col justify-center items-center">
                <svg ref={barcodeRef} className='w-full'></svg>
                <p className="text-sm font-bold mt-1">Length: {length.toFixed(2)}</p>
            </div>
        </div>
    );
}
