import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MeasurementSaveLoader } from "../saving/MeasurementSaveLoader";
import { useAuth } from "@/context/AuthContext";
import { getFreshStorageReadUrlAction, getFreshStorageReadUrlsAction } from "@/app/dashboard/visits/actions";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useEffect, useRef, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function MeasurementPreviewDialog({
  open,
  onClose,
  onOpenChange,
  data,
  onSave,
  saving,
  saveStep,
}: any) {
  const { user } = useAuth();
  const [pdfLoading, setPdfLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const photoRefreshAttemptedRef = useRef<Set<string>>(new Set());
  const [refreshedPhotoUrls, setRefreshedPhotoUrls] = useState<Record<string, string>>({});

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  const collectPhotoUrls = (payload: any): string[] => {
    const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];
    const urls: string[] = [];
    rooms.forEach((room: any) => {
      const items = Array.isArray(room?.items) ? room.items : [];
      items.forEach((item: any) => {
        const photos = Array.isArray(item?.photos) ? item.photos : [];
        photos.forEach((photo: any) => {
          const url = String(photo || "").trim();
          if (!url) return;
          if (!/^https?:\/\//i.test(url)) return;
          urls.push(url);
        });
      });
    });
    return Array.from(new Set(urls));
  };

  useEffect(() => {
    let active = true;
    if (!open || !data) {
      setRefreshedPhotoUrls({});
      photoRefreshAttemptedRef.current.clear();
      return;
    }

    const uniquePhotoUrls = collectPhotoUrls(data);
    if (uniquePhotoUrls.length === 0) {
      setRefreshedPhotoUrls({});
      photoRefreshAttemptedRef.current.clear();
      return;
    }

    const refreshUrls = async () => {
      try {
        const refreshed = await getFreshStorageReadUrlsAction(uniquePhotoUrls);
        if (!active) return;
        setRefreshedPhotoUrls(refreshed || {});
      } catch (error) {
        console.warn("Failed to refresh measurement photo URLs:", error);
        if (active) setRefreshedPhotoUrls({});
      }
    };

    void refreshUrls();

    return () => {
      active = false;
    };
  }, [open, data]);

  const resolvePhotoUrl = (url: string) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    return refreshedPhotoUrls[raw] || raw;
  };

  const handlePhotoLoadError = async (originalUrl: string) => {
    const raw = String(originalUrl || "").trim();
    if (!raw) return;
    if (!/^https?:\/\//i.test(raw)) return;
    if (photoRefreshAttemptedRef.current.has(raw)) return;
    photoRefreshAttemptedRef.current.add(raw);

    try {
      const refreshed = await getFreshStorageReadUrlAction(raw);
      if (refreshed && refreshed !== raw) {
        setRefreshedPhotoUrls((prev) => ({ ...prev, [raw]: refreshed }));
      }
    } catch (error) {
      console.warn("Unable to refresh photo URL:", error);
    }
  };

  // Check if data exists
  if (!data) {
    return null;
  }

  /**
   * 🚀 IMPROVED PDF GENERATION WITH MULTI-PAGE SUPPORT
   * Fixes: Content cutoff, jsPDF scale errors, screen size issues
   */
const handleDownloadPdf = async () => {
  setPdfLoading(true);
  try {
    const element = previewRef.current;
    if (!element) {
      toast.error("Preview content not found");
      setPdfLoading(false);
      return;
    }

    // Wait for all images to load
    const images = element.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          // Add crossOrigin if not already set
          if (!img.crossOrigin) {
            img.crossOrigin = "anonymous";
          }
        });
      })
    );

    // Small delay to ensure rendering is complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Store original styles
    const originalOverflow = element.style.overflow;
    const originalMaxHeight = element.style.maxHeight;

    // Temporarily remove constraints for capture
    element.style.overflow = "visible";
    element.style.maxHeight = "none";

    // Capture the full element with proper settings
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1200,
      imageTimeout: 15000, // 15 second timeout for images
      onclone: (clonedDoc) => {
        // Ensure all images in cloned document have crossOrigin set
        const clonedImages = clonedDoc.querySelectorAll("img");
        clonedImages.forEach((img: HTMLImageElement) => {
          img.crossOrigin = "anonymous";
        });
      },
    });

    // Restore original styles
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;

    // Validate canvas
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Canvas generation failed");
    }

    // Try PNG first, fallback to JPEG if it fails
    let imgData: string;
    try {
      imgData = canvas.toDataURL("image/png", 1.0);
      
      // Validate the data URL
      if (!imgData || imgData === "data:,") {
        throw new Error("Invalid PNG data");
      }
    } catch (pngError) {
      console.warn("PNG generation failed, trying JPEG:", pngError);
      imgData = canvas.toDataURL("image/jpeg", 0.95);
    }

    // A4 dimensions in mm
    const pdfWidth = 210;
    const pdfHeight = 297;

    // Calculate image dimensions to fit A4
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    // Initialize PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    let heightLeft = imgHeight;
    let position = 0;
    let pageNumber = 1;

    // Add first page
    pdf.addImage(
      imgData,
      imgData.startsWith("data:image/png") ? "PNG" : "JPEG",
      0,
      position,
      imgWidth,
      imgHeight,
      undefined,
      "FAST"
    );
    heightLeft -= pdfHeight;

    // Add additional pages if content overflows
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pageNumber++;
      pdf.addImage(
        imgData,
        imgData.startsWith("data:image/png") ? "PNG" : "JPEG",
        0,
        position,
        imgWidth,
        imgHeight,
        undefined,
        "FAST"
      );
      heightLeft -= pdfHeight;
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const fileName = `Measurement_${data?.dealId || "Unknown"}_${timestamp}.pdf`;

    // Download PDF
    pdf.save(fileName);

    toast.success(`PDF downloaded successfully! (${pageNumber} page${pageNumber > 1 ? "s" : ""})`);
  } catch (error) {
    console.error("PDF generation error:", error);
    toast.error(
      error instanceof Error 
        ? `Failed to generate PDF: ${error.message}` 
        : "Failed to generate PDF. Please try again."
    );
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

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!saving && !isOpen) {
          handleClose();
        }
      }}
    >

      <DialogContent className="p-0 w-[92vw] max-w-6xl h-[95dvh] rounded-lg overflow-auto">
        <DialogHeader className="p-4 sm:p-8 pb-0 sr-only">
          <DialogTitle>Measurement Preview</DialogTitle>
        </DialogHeader>

        {/* 📄 SCROLLABLE PREVIEW CONTAINER */}
        <div className="h-full w-full overflow-y-auto overflow-x-auto bg-gray-100">
          <div
            id="measurement-preview-content"
            ref={previewRef}
            className="bg-white text-black p-8 min-w-[800px] max-w-[1200px] mx-auto"
            style={{
              /* Ensure consistent rendering for PDF */
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
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
                    room.items?.filter((item: any) => item.type === "wallpaper") || [];
                    
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
                      className="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid"
                      style={{ pageBreakInside: 'avoid' }}
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
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="text-center py-3 px-3 font-semibold text-gray-700 border-r border-gray-200">
                                  Sr.No
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Item Name
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Seat
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Fab Qty
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Rate
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Extra
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">
                                  Remark
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700">
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
                                  <td className="py-4 px-3 text-center text-gray-600 font-medium align-top border-r border-gray-200">
                                    {iIdx + 1}
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {getValue(item.data?.name)}
                                    </span>
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {getValue(item.data?.seats)}
                                    </span>
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {getValue(item.data?.fabqty)}
                                    </span>
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {item.data?.rate ? `₹${item.data.rate}` : "-"}
                                    </span>
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    {item.data?.extras && item.data.extras.length > 0 ? (
                                      <div className="space-y-1 text-xs">
                                        {item.data.extras.map((ex: any, exIdx: number) => (
                                          <div
                                            key={exIdx}
                                            className="bg-blue-50 p-2 rounded border border-blue-200"
                                          >
                                            <p className="font-medium capitalize text-blue-900">
                                              {ex.type}
                                            </p>
                                            {ex.type === "foam" && (
                                              <div className="text-gray-700 space-y-0.5">
                                                <p>Size: <span className="font-medium">{ex.size}</span></p>
                                                <p>Density: <span className="font-medium">{ex.density}</span></p>
                                                <p>Qty: <span className="font-medium">{ex.qty}</span></p>
                                              </div>
                                            )}
                                            {ex.type === "stitching" && ex.rate && (
                                              <p className="text-gray-700">
                                                Rate: <span className="font-medium">₹{ex.rate}</span>
                                              </p>
                                            )}
                                            {ex.type === "casement" && ex.qty && (
                                              <p className="text-gray-700">
                                                Qty: <span className="font-medium">{ex.qty}</span>
                                              </p>
                                            )}
                                            {(ex.type === "niwar" || ex.type === "Marking") && ex.qty && (
                                              <p className="text-gray-700">
                                                Qty: <span className="font-medium">{ex.qty}</span>
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">-</span>
                                    )}
                                  </td>

                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                      {getValue(item.remark)}
                                    </p>
                                  </td>

                                  <td className="py-4 px-4 align-top">
                                    {item.photos && item.photos.length > 0 ? (
                                      <div className="flex gap-1 flex-wrap">
                                        {item.photos.map((img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={resolvePhotoUrl(img)}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded"
                                            alt={`${item.type} ${idx + 1}`}
                                            onError={() => {
                                              void handlePhotoLoadError(img);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">No photo</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* WALLPAPER ITEMS TABLE */}
                      {wallpaperItems.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="text-center py-3 px-3 font-semibold text-gray-700 border-r border-gray-200">Sr.No</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Type</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Length</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Width</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Uses</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Remark</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700">Photo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {wallpaperItems.map((item: any, iIdx: number) => (
                                <tr key={iIdx} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="py-4 px-3 text-center text-gray-600 font-medium align-top border-r border-gray-200">
                                    {iIdx + 1}
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-semibold text-gray-800 capitalize text-xs bg-amber-100 px-2 py-1 rounded-lg">
                                      {getValue(item.type)}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.height)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.width)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {item.data?.uses ? `${item.data.uses}` : "-"}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <p className="text-xs text-gray-600 max-w-[150px] break-words line-clamp-3" title={item.remark}>
                                      {getValue(item.remark)}
                                    </p>
                                  </td>
                                  <td className="py-4 px-4 align-top">
                                    {item.photos && item.photos.length > 0 ? (
                                      <div className="flex gap-1 flex-wrap">
                                        {item.photos.map((img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={resolvePhotoUrl(img)}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded"
                                            alt={`${item.type} ${idx + 1}`}
                                            onError={() => {
                                              void handlePhotoLoadError(img);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">No photo</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* FLOORING ITEMS TABLE */}
                      {flooringItems.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="text-center py-3 px-3 font-semibold text-gray-700 border-r border-gray-200">Sr.No</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Type</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Length</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Width</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Skirting</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Profile</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Beading</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Remark</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700">Photo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {flooringItems.map((item: any, iIdx: number) => (
                                <tr key={iIdx} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="py-4 px-3 text-center text-gray-600 font-medium align-top border-r border-gray-200">
                                    {iIdx + 1}
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-semibold text-gray-800 capitalize text-xs bg-violet-100 px-2 py-1 rounded-lg">
                                      {getValue(item.type)}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.height)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.width)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {item.data?.skirting ? `${item.data.skirting}` : "-"}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {item.data?.profile ? `${item.data.profile}` : "-"}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {item.data?.beading ? `${item.data.beading}` : "-"}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                      {getValue(item.remark)}
                                    </p>
                                  </td>
                                  <td className="py-4 px-4 align-top">
                                    {item.photos && item.photos.length > 0 ? (
                                      <div className="flex gap-1 flex-wrap">
                                        {item.photos.map((img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={resolvePhotoUrl(img)}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded"
                                            alt={`${item.type} ${idx + 1}`}
                                            onError={() => {
                                              void handlePhotoLoadError(img);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">No photo</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* OTHER ITEMS TABLE */}
                      {otherItems.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="text-center py-3 px-3 font-semibold text-gray-700 border-r border-gray-200">Sr.No</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Type</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Length</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Width</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Panel</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Specifications</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Remark</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-700">Photo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otherItems.map((item: any, iIdx: number) => (
                                <tr key={iIdx} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="py-4 px-3 text-center text-gray-600 font-medium align-top border-r border-gray-200">
                                    {iIdx + 1}
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-semibold text-gray-800 capitalize text-xs bg-gray-100 px-2 py-1 rounded">
                                      {getValue(item.type)}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">
                                      {getValue(item.data?.height || item.data?.length)}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.width)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <span className="font-medium text-gray-800">{getValue(item.data?.panels)}</span>
                                  </td>
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <div className="space-y-1 text-xs">
                                      {/* ================= CURTAIN ================= */}
                                      {item.type === "curtain" && (
                                        <>
                                          {item.data?.panelsdis ? (
                                            <p>
                                              <span className="text-gray-600">Panels Dist:</span>{" "}
                                              <span className="font-medium">{item.data.panelsdis}</span>
                                            </p>
                                          ) : null}
                                          
                                          {item.data?.pinch ? (
                                            <p>
                                              <span className="text-gray-600">Pinch:</span>{" "}
                                              <span className="font-medium">{item.data.pinch}</span>
                                            </p>
                                          ) : null}
                                          
                                          {item.data?.eyelet ? (
                                            <p>
                                              <span className="text-gray-600">Eyelet:</span>{" "}
                                              <span className="font-medium">{item.data.eyelet}</span>
                                            </p>
                                          ) : null}
                                          
                                          {item.data?.rodpocket ? (
                                            <p>
                                              <span className="text-gray-600">Rod Pocket:</span>{" "}
                                              <span className="font-medium">{item.data.rodpocket}</span>
                                            </p>
                                          ) : null}
                                          
                                          {item.data?.tabTop ? (
                                            <p>
                                              <span className="text-gray-600">Tab Top:</span>{" "}
                                              <span className="font-medium">{item.data.tabTop}</span>
                                            </p>
                                          ) : null}
                                          
                                          {item.data?.lining ? (
                                            <p>
                                              <span className="text-gray-600">Lining:</span>{" "}
                                              <span className="font-medium">{item.data.lining}</span>
                                            </p>
                                          ) : null}
                                          
                                          {!item.data?.panelsdis && 
                                           !item.data?.pinch && 
                                           !item.data?.eyelet && 
                                           !item.data?.rodpocket && 
                                           !item.data?.tabTop && 
                                           !item.data?.lining && (
                                            <span className="text-gray-400">-</span>
                                          )}
                                        </>
                                      )}

                                      {/* ================= BLIND ================= */}
                                      {item.type === "blind" && (
                                        <>
                                          {item.data?.control && (
                                            <p>
                                              <span className="text-gray-600">Control:</span>{" "}
                                              <span className="font-medium">{item.data.control}</span>
                                            </p>
                                          )}
                                          {item.data?.windowInstall && (
                                            <p>
                                              <span className="text-gray-600">Window:</span>{" "}
                                              <span className="font-medium">{item.data.windowInstall}</span>
                                            </p>
                                          )}
                                          {item.data?.fittingType && (
                                            <p>
                                              <span className="text-gray-600">Fitting:</span>{" "}
                                              <span className="font-medium">{item.data.fittingType}</span>
                                            </p>
                                          )}

                                          {!item.data?.control &&
                                            !item.data?.windowInstall &&
                                            !item.data?.fittingType && (
                                              <span className="text-gray-400">-</span>
                                            )}
                                        </>
                                      )}

                                      {/* ================= SIMPLE ================= */}
                                      {item.type === "simple" && (
                                        <span className="text-gray-400 italic">No specifications</span>
                                      )}

                                      {/* ================= FALLBACK (OTHER TYPES) ================= */}
                                      {item.type !== "curtain" &&
                                        item.type !== "blind" &&
                                        item.type !== "simple" && (
                                          <span className="text-gray-400">-</span>
                                        )}
                                    </div>
                                  </td>
                                  
                                  <td className="py-4 px-4 align-top border-r border-gray-200">
                                    <p className="text-xs text-gray-600 max-w-[150px] break-words">
                                      {getValue(item.remark)}
                                    </p>
                                  </td>

                                  <td className="py-4 px-4 align-top">
                                    {item.photos && item.photos.length > 0 ? (
                                      <div className="flex gap-1 flex-wrap">
                                        {item.photos.map((img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={resolvePhotoUrl(img)}
                                            className="h-14 w-14 object-cover border border-gray-300 rounded"
                                            alt={`${item.type} ${idx + 1}`}
                                            onError={() => {
                                              void handlePhotoLoadError(img);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">No photo</span>
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
                  <p className="text-xs text-gray-500 mt-1">Date: _______________</p>
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
        </div>

        {/* ACTIONS FOOTER - STICKY */}
        <div className="flex gap-4 pt-6 px-4 sm:px-8 pb-4 border-t bg-white sticky bottom-0 z-10">
          <Button
            type="button"
            onClick={handleClose}
            variant="outline"
            className="flex-1"
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading || saving}
            variant="secondary"
            className="flex-1"
          >
            {pdfLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                PDF...
              </>
            ) : (
              <>
                <CloudDownload className="mr-2 h-4 w-4" /> 
                PDF
              </>
            )}
          </Button>

          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              "💾 Save Measurement"
            )}
          </Button>
        </div>

        {/* SAVE PROGRESS OVERLAY */}
        {saving && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
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
