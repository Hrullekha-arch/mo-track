import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MeasurementSaveLoader } from "../saving/MeasurementSaveLoader";
import { useAuth } from "@/context/AuthContext";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function MeasurementPreviewDialog({
  open,
  onClose,
  data,
  onSave,
  saving,
  saveStep,
}: any) {
  const { user } = useAuth();
  const [pdfLoading, setPdfLoading] = useState(false);

  // Check if data exists
  if (!data) {
    return null;
  }

  const handleDownloadPdf = async () => {
    const elementToCapture = document.getElementById("measurement-preview-content");
    if (!elementToCapture) return;

    setPdfLoading(true);
    try {
      const canvas = await html2canvas(elementToCapture, {
        scale: 2, // Higher scale for better resolution
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Measurement-${data.dealId || "details"}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
      // You might want to use a toast notification here
    } finally {
      setPdfLoading(false);
    }
  };

  // Helper to safely get value or show dash
  const getValue = (v: any) => {
    if (v === null || v === undefined) return "-";
    if (typeof v === "string" && v.trim() === "") return "-";
    return v;
  };

  const Doer = user?.name || "System";

  // Console log to inspect data structure);

  if (data.rooms && data.rooms.length > 0) {
    data.rooms.forEach((room: any, idx: number) => {
      if (room.items && room.items.length > 0) {
        room.items.forEach((item: any, itemIdx: number) => {});
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!saving) onClose(v);
      }}
    >
      <DialogContent className="p-0 w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-hidden sm:max-w-4xl">
        <DialogHeader className="p-4 sm:p-8 pb-0 sr-only">
          <DialogTitle>Measurement Preview</DialogTitle>
        </DialogHeader>
        <div
          id="measurement-preview-content"
          className="bg-white text-black p-4 sm:p-8 h-full w-full flex flex-col overflow-y-auto"
        >
          {/* HEADER */}
          <div className="text-center border-b-2 border-gray-800 pb-6 mb-8">
            <h1 className="text-3xl font-bold text-gray-800">
              MO SPACES PVT LTD
            </h1>
            <p className="text-sm text-gray-600 mt-2 uppercase tracking-wide">
              Measurement Sheet
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Date: {new Date().toLocaleDateString("en-IN")}
            </p>
          </div>

          {/* CUSTOMER INFO SECTION */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <span className="text-gray-600">Customer Name:</span>
                <span className="ml-2 font-semibold text-gray-800">
                  {getValue(data.customerName)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Deal ID:</span>
                <span className="ml-2 font-semibold text-gray-800">
                  {getValue(data.dealId)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Measured By:</span>
                <span className="ml-2 font-semibold text-gray-800">{Doer}</span>
              </div>
            </div>
          </div>

          {/* ROOMS SECTION */}
          {data.rooms && data.rooms.length > 0 ? (
            <div className="space-y-8">
              {data.rooms.map((room: any, rIdx: number) => {
                // Group items by type
                const furnitureItems =
                  room.items?.filter(
                    (item: any) =>
                      item.type === "furniture" || item.type === "sofa"
                  ) || [];

                const wallpaperItems =
                  room.items?.filter((item: any) => item.type === "wallpaper") ||
                  [];
                const flooringItems =
                  room.items?.filter(
                    (item: any) =>
                      item.type === "carpetflooring" ||
                      item.type === "woodenflooring"
                  ) || [];

                const otherItems =
                  room.items?.filter(
                    (item: any) =>
                      item.type !== "furniture" &&
                      item.type !== "sofa" &&
                      item.type !== "wallpaper" &&
                      item.type !== "carpetflooring" &&
                      item.type !== "woodenflooring"
                  ) || [];

                return (
                  <div
                    key={rIdx}
                    className="border border-gray-300 rounded-lg overflow-hidden"
                  >
                    {/* ROOM HEADER */}
                    <div className="bg-gray-800 text-white px-6 py-3">
                      <h2 className="font-semibold text-base uppercase tracking-wide">
                        {getValue(room.roomName)}
                      </h2>
                    </div>

                    {/* FURNITURE ITEMS TABLE */}
                    {furnitureItems.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                              <th className="text-center py-3 px-3 font-semibold text-gray-700 w-16">
                                Sr. No
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Item Name
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-24">
                                Seat
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Fab Qty
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Rate
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Extra
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-32">
                                Remark
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-40">
                                Photo
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {furnitureItems.map((item: any, iIdx: number) => (
                              <tr
                                key={iIdx}
                                className="border-b border-gray-200 hover:bg-gray-50"
                              >
                                <td className="py-4 px-3 text-center text-gray-600 font-medium align-top">
                                  {iIdx + 1}
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.name)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.seats)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.fabqty)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {item.data?.rate
                                      ? `₹${item.data.rate}`
                                      : "-"}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top w-35">
                                  {item.data?.extras &&
                                  item.data.extras.length > 0 ? (
                                    <div className="space-y-1 text-xs">
                                      {item.data.extras.map(
                                        (ex: any, exIdx: number) => (
                                          <div
                                            key={exIdx}
                                            className="bg-blue-50 p-2 rounded border border-blue-200 w-25"
                                          >
                                            <p className="font-medium capitalize text-blue-900">
                                              {ex.type}
                                            </p>
                                            {ex.type === "foam" && (
                                              <div className="text-gray-700 space-y-0.5">
                                                <p>
                                                  Size:{" "}
                                                  <span className="font-medium">
                                                    {ex.size}
                                                  </span>
                                                </p>
                                                <p>
                                                  Density:{" "}
                                                  <span className="font-medium">
                                                    {ex.density}
                                                  </span>
                                                </p>
                                                <p>
                                                  Qty:{" "}
                                                  <span className="font-medium">
                                                    {ex.qty}
                                                  </span>
                                                </p>
                                              </div>
                                            )}
                                            {ex.type === "stitching" &&
                                              ex.rate && (
                                                <p className="text-gray-700">
                                                  Rate:{" "}
                                                  <span className="font-medium">
                                                    ₹{ex.rate}
                                                  </span>
                                                </p>
                                              )}
                                            {ex.type === "casement" &&
                                              ex.qty && (
                                                <p className="text-gray-700">
                                                  Qty:{" "}
                                                  <span className="font-medium">
                                                    {ex.qty}
                                                  </span>
                                                </p>
                                              )}
                                            {(ex.type === "niwar" ||
                                              ex.type === "Marking") &&
                                              ex.qty && (
                                                <p className="text-gray-700">
                                                  Qty:{" "}
                                                  <span className="font-medium">
                                                    {ex.qty}
                                                  </span>
                                                </p>
                                              )}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">
                                      -
                                    </span>
                                  )}
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                    {getValue(item.remark)}
                                  </p>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  {item.photos && item.photos.length > 0 ? (
                                    <div className="flex gap-1 flex-wrap">
                                      {item.photos.map(
                                        (img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={img}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded cursor-pointer hover:scale-110 transition-transform"
                                            alt={`${item.type} ${idx + 1}`}
                                          />
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">
                                      No photo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* WallPaper ITEMS TABLE */}
                    {wallpaperItems.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                              <th className="text-center py-3 px-3 font-semibold text-gray-700 w-16">
                                Sr. No
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Type
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-24">
                                Length
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Width
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Uses
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-32">
                                Remark
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-40">
                                Photo
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {wallpaperItems.map((item: any, iIdx: number) => (
                              <tr
                                key={iIdx}
                                className="border-b border-gray-200 hover:bg-gray-50"
                              >
                                <td className="py-4 px-3 text-center text-gray-600 font-medium align-top">
                                  {iIdx + 1}
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-semibold text-gray-800 capitalize text-xs bg-amber-100 px-2 py-1 rounded-lg justify-center items-center">
                                    {getValue(item.type)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.height)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.width)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {item.data?.uses
                                      ? `${item.data.uses}`
                                      : "-"}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <p
                                    className="text-xs text-gray-600 max-w-[150px] break-words line-clamp-3"
                                    title={item.remark}
                                  >
                                    {getValue(item.remark)}
                                  </p>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  {item.photos && item.photos.length > 0 ? (
                                    <div className="flex gap-1 flex-wrap">
                                      {item.photos.map(
                                        (img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={img}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded cursor-pointer hover:scale-110 transition-transform"
                                            alt={`${item.type} ${idx + 1}`}
                                          />
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">
                                      No photo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* flooring ITEMS TABLE */}
                    {flooringItems.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                              <th className="text-center py-3 px-3 font-semibold text-gray-700 w-16">
                                Sr. No
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Type
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-24">
                                Length
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Width
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Skirting
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Profile
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Beading
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-32">
                                Remark
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-40">
                                Photo
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {flooringItems.map((item: any, iIdx: number) => (
                              <tr
                                key={iIdx}
                                className="border-b border-gray-200 hover:bg-gray-50"
                              >
                                <td className="py-4 px-3 text-center text-gray-600 font-medium align-top">
                                  {iIdx + 1}
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-semibold text-gray-800 capitalize text-xs bg-violet-100 px-2 py-1 rounded-lg justify-center items-center">
                                    {getValue(item.type)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.height)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.width)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {item.data?.skirting
                                      ? `${item.data.skirting}`
                                      : "-"}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {item.data?.profile
                                      ? `${item.data.profile}`
                                      : "-"}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {item.data?.beading
                                      ? `${item.data.beading}`
                                      : "-"}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                    {getValue(item.remark)}
                                  </p>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  {item.photos && item.photos.length > 0 ? (
                                    <div className="flex gap-1 flex-wrap">
                                      {item.photos.map(
                                        (img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={img}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded cursor-pointer hover:scale-110 transition-transform"
                                            alt={`${item.type} ${idx + 1}`}
                                          />
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">
                                      No photo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* OTHER ITEMS TABLE (Curtain, Blind, Simple) */}
                    {otherItems.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                              <th className="text-center py-3 px-3 font-semibold text-gray-700 w-16">
                                Sr. No
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Type
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Length
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">
                                Width
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-24">
                                Panel
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                                Specifications
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-32">
                                Remark
                              </th>
                              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-40">
                                Photo
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {otherItems.map((item: any, iIdx: number) => (
                              <tr
                                key={iIdx}
                                className="border-b border-gray-200 hover:bg-gray-50"
                              >
                                <td className="py-4 px-3 text-center text-gray-600 font-medium align-top">
                                  {iIdx + 1}
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-semibold text-gray-800 capitalize text-xs bg-gray-100 px-2 py-1 rounded">
                                    {getValue(item.type)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(
                                      item.data?.height || item.data?.length
                                    )}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.width)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <span className="font-medium text-gray-800">
                                    {getValue(item.data?.panels)}
                                  </span>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  <div className="space-y-1 text-xs">
                                    {/* ================= CURTAIN ================= */}
                                    {item.type === "curtain" && (
                                      <>
                                        {item.data?.panelsdis ? (
                                          <p>
                                            <span className="text-gray-600">
                                              P:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {item.data.panelsdis}
                                            </span>
                                          </p>
                                        ) : (
                                          <span className="text-gray-400">
                                            -
                                          </span>
                                        )}
                                      </>
                                    )}

                                    {/* ================= BLIND ================= */}
                                    {item.type === "blind" && (
                                      <>
                                        {item.data?.control && (
                                          <p>
                                            <span className="text-gray-600">
                                              Control:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {item.data.control}
                                            </span>
                                          </p>
                                        )}
                                        {item.data?.windowInstall && (
                                          <p>
                                            <span className="text-gray-600">
                                              Window:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {item.data.windowInstall}
                                            </span>
                                          </p>
                                        )}
                                        {item.data?.fittingType && (
                                          <p>
                                            <span className="text-gray-600">
                                              Fitting:
                                            </span>{" "}
                                            <span className="font-medium">
                                              {item.data.fittingType}
                                            </span>
                                          </p>
                                        )}

                                        {!item.data?.control &&
                                          !item.data?.windowInstall &&
                                          !item.data?.fittingType && (
                                            <span className="text-gray-400">
                                              -
                                            </span>
                                          )}
                                      </>
                                    )}

                                    {/* ================= SIMPLE ================= */}
                                    {item.type === "simple" && (
                                      <span className="text-gray-400 italic">
                                        No specifications
                                      </span>
                                    )}

                                    {/* ================= FALLBACK (OTHER TYPES) ================= */}
                                    {item.type !== "curtain" &&
                                      item.type !== "blind" &&
                                      item.type !== "simple" && (
                                        <span className="text-gray-400">
                                          -
                                        </span>
                                      )}
                                  </div>
                                </td>
                                <td className="py-4 px-4 align-top">
                                  <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                    {getValue(item.remark)}
                                  </p>
                                </td>

                                <td className="py-4 px-4 align-top">
                                  {item.photos && item.photos.length > 0 ? (
                                    <div className="flex gap-1 flex-wrap">
                                      {item.photos.map(
                                        (img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={img}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded cursor-pointer hover:scale-110 transition-transform"
                                            alt={`${item.type} ${idx + 1}`}
                                          />
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">
                                      No photo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* NO ITEMS MESSAGE */}
                    {furnitureItems.length === 0 &&
                      otherItems.length === 0 &&
                      wallpaperItems.length === 0 &&
                      flooringItems.length === 0 && (
                        <div className="p-8 text-center text-gray-400">
                          No items added to this room
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 border border-gray-200 rounded">
              No rooms added yet
            </div>
          )}

          {/* FOOTER NOTES */}
          <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
            <p className="font-semibold mb-2">Notes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>All measurements are in feet/mm as specified</li>
              <li>Please verify all measurements before final production</li>
              <li>Any discrepancies should be reported within 48 hours</li>
            </ul>
          </div>

          {/* SIGNATURE SECTION */}
          <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-12">
                <p className="font-semibold">Customer Signature</p>
                <p className="text-xs text-gray-500 mt-1">
                  Date: _______________
                </p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-12">
                <p className="font-semibold">Authorized Signatory</p>
                <p className="text-xs text-gray-500 mt-1">MO Spaces Pvt Ltd</p>
              </div>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-4 mt-auto pt-6 px-4 sm:px-8 border-t bg-white sticky bottom-0">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="w-1/2"
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading || saving}
            variant="secondary"
            className="w-1/2"
          >
            {pdfLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              "📄 Download PDF"
            )}
          </Button>

          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-1/2"
          >
            {saving ? "Saving…" : "💾 Save Measurement"}
          </Button>
        </div>

        {/* SAVE PROGRESS OVERLAY */}
        {saving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="w-[420px] rounded-2xl bg-white shadow-2xl border p-6 animate-in fade-in zoom-in">
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                Saving Measurement
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Please wait, do not close this window
              </p>

              <MeasurementSaveLoader step={saveStep} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
