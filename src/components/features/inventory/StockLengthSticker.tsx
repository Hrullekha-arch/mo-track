
"use client";

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import Image from 'next/image';

interface StockLengthStickerProps {
    bcn: string;
    length: number;
    rack: string;
}

// 72.1mm x 49.8mm at 96 DPI
const STICKER_WIDTH_PX = 272;
const STICKER_HEIGHT_PX = 188;

export function StockLengthSticker({ bcn, length, rack }: StockLengthStickerProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);
    const barcodeValue = `${bcn}|${length.toFixed(2)}`;

    useEffect(() => {
        if (barcodeRef.current && barcodeValue) {
            try {
                JsBarcode(barcodeRef.current, barcodeValue, {
                    format: "CODE128",
                    width: 1.5,
                    height: 25,
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
            style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px`, fontFamily: 'Arial, sans-serif' }}
        >
            {/* Top Section */}
             <div className="flex items-center justify-between">
                <div className="flex-shrink-0">
                    <Image src="/logo.png" alt="Logo" width={50} height={50} data-ai-hint="logo" />
                </div>
                <div className="text-center">
                    <p className="text-[10px] font-bold leading-tight">MO DESIGN PVT LTD</p>
                    <p className="text-[9px] leading-tight">9971129532</p>
                </div>
                <div style={{ width: '40px', height: '40px', border: '1px solid #333', borderRadius: '50%' }} className="flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[9px] leading-none">Rack</span>
                    <span className="text-sm font-bold leading-none">{!rack || rack === 'N/A' ? '___' : rack}</span>
                </div>
            </div>

            {/* Middle Section */}
            <div className='my-1 text-center space-y-1'>
                <p className="text-xs">BCN: <span className="font-bold">{bcn || 'N/A'}</span></p>
            </div>
            
            {/* Bottom Section */}
            <div className="flex flex-col justify-center items-center w-full">
                <svg ref={barcodeRef} className='w-full max-w-[95%]'></svg>
                 <div className="flex justify-center items-center w-full mt-1">
                    <p className="text-base font-bold">Length: {length.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
}
