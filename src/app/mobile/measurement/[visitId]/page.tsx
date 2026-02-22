

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, X, AlertTriangleIcon } from "lucide-react";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import { toast } from "sonner";
import { getDealById, getMeasurementsForDeal, saveMeasurementToDeal, startVisitAction, uploadFileToStorageAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { getCustomerById } from "@/app/dashboard/customers/actions";
import { useAuth } from "@/context/AuthContext";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { effect } from "zod";
import { json } from "node:stream/consumers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { MeasurementEntry } from "@/lib/types";
import { db } from "@/lib/firebase";

export default function MeasurementTableForm() {
  const searchParams = useSearchParams();
  const { visitId } = useParams<{ visitId: string }>();
  
  // Get logged in user from localStorage
  const getLoggedInUser = () => {
    if (typeof window !== "undefined") {
      try {
        const user = localStorage.getItem("user");
        return user ? JSON.parse(user)?.name || "System" : "System";
      } catch {
        return "System";
      }
    }
    return "System";
  };

  // Customer & Header Info - Auto-filled from params
  const [customerName, setCustomerName] = useState("");
  const [dealId, setDealId] = useState("");
  const [createdby, setCreatedby] = useState("");
  const {user} =useAuth();
  const [doerName,setDoerName] = useState("");
  const customerId = searchParams.get("customerId"); // from old flow
  const dealIdParam = searchParams.get("dealId");    // already used
  const [headerLoading, setHeaderLoading] = useState(false);
  const [fsCustomerId, setFsCustomerId] = useState<string>("");
  const [fsDealId, setFsDealId] = useState<string>(""); // Firestore deal doc id
  const [measurementId, setMeasurementId] = useState<string>(""); // Firestore deal doc id



  // Auto-fill from URL params on mount
useEffect(() => {
  const loadHeader = async () => {
    try {
      setHeaderLoading(true);

      console.log("🟡 FIRESTORE HEADER FETCH START");
      console.log({ customerId, dealIdParam, visitId });

      // ✅ must have these 2 for the old actions
      if (!customerId || !dealIdParam) {
        // fallback to your existing URL params "customer" etc.
        const customer = searchParams.get("customer");
        const createdbyParam = searchParams.get("createdby");

        if (customer) setCustomerName(customer);
        if (dealIdParam) setDealId(dealIdParam);
        if (createdbyParam) setCreatedby(createdbyParam);

        return;
      }
      
      startVisitAction(customerId, dealIdParam, visitId);

      // same as old page
      const measurement = await getMeasurementsForDeal(customerId, dealIdParam);
      if (!measurement) throw new Error("Measurement not found");

      const [customer, deal] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealIdParam),
      ]);

      // ✅ header fill like old
      setCustomerName(customer?.name || "");
      setDealId(deal?.dealId || dealIdParam);

      // ✅ optional (depends on what your measurement/visit contains)
      // If measurement has createdBy/doerName, use them:
      setDoerName(user?.name);

      // if you want installer to come from Firestore (otherwise keep logged-in)

      console.log("🟢 HEADER FILLED FROM FIRESTORE");
    } catch (e: any) {
      console.error(e);
      toast("Header load failed", { description: e.message });
    } finally {
      setHeaderLoading(false);
    }
  };

  loadHeader();
}, [customerId, dealIdParam, visitId, searchParams, user?.name]);
useEffect(() => {
  const cId = searchParams.get("customerId") || "";
  const dId = searchParams.get("dealId") || ""; // Firestore deal doc id (old style)
  const measurementId = searchParams.get("measurementId") || ""; // Firestore deal doc id (old style)

  setFsCustomerId(cId);
  setFsDealId(dId);
  setMeasurementId(measurementId);
}, [searchParams]);



  // Room Management
  const [currentRoom, setCurrentRoom] = useState("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoomIndex, setCurrentRoomIndex] = useState<number | null>(null);
  
  // Current item form state
  const [itemType, setItemType] = useState("");
  const [itemData, setItemData] = useState<any>({});
  const [itemRemark, setItemRemark] = useState("");
  const [itemPhotos, setItemPhotos] = useState<File[]>([]);
  const [itemExtras, setItemExtras] = useState<any[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStep, setSaveStep] = useState<
    "idle" | "pdf" | "upload" | "sheet" | "done" | "error"
  >("idle");
  const router = useRouter();



  
  // Current room's items
  const [currentItems, setCurrentItems] = useState<any[]>([]);
  
  // Extra dialog
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [currentExtra, setCurrentExtra] = useState<any>({ type: "foam" });

  // Reset item form
  const resetItemForm = () => {
    setItemData({});
    setItemRemark("");
    setItemPhotos([]);
    setItemExtras([]);
    setEditingItemIndex(null);
  };

  const compressImage = (file: File, quality = 0.7, maxSize = 1280): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            return reject(new Error('Canvas to Blob failed'));
                        }
                        const newFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
  };

  // Handle photo upload
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    toast.info("Compressing images... Please wait.");
    try {
        const compressedFilesPromises = files.map(file => compressImage(file));
        const compressedFiles = await Promise.all(compressedFilesPromises);
        
        setItemPhotos(prev => [...prev, ...compressedFiles]);
        toast.success(`${compressedFiles.length} image(s) compressed and ready.`);
    } catch (error) {
        console.error("Image compression failed:", error);
        toast.error("Could not process images. Please try a different file.");
    }
  };

  // Remove photo
  const removePhoto = (index: number) => {
    setItemPhotos(itemPhotos.filter((_, i) => i !== index));
  };

  // Add Extra Item (for furniture)
  const handleAddExtra = () => {
    setItemExtras([...itemExtras, currentExtra]);
    setCurrentExtra({ type: "foam" });
    setExtraDialogOpen(false);
  };

  // Remove Extra
  const removeExtra = (index: number) => {
    setItemExtras(itemExtras.filter((_, i) => i !== index));
  };
  // Preview Dialog
  const [previewOpen, setPreviewOpen] = useState(false);

  const base64Marker = "base64,";

  const stripDataUrlPrefix = (value: string) => {
    const markerIndex = value.indexOf(base64Marker);
    return markerIndex >= 0 ? value.slice(markerIndex + base64Marker.length) : value;
  };

  const getDataUrlMimeType = (value: string) => {
    const match = value.match(/^data:([^;]+);base64,/);
    return match?.[1] || "application/octet-stream";
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const fileToBase64Payload = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(stripDataUrlPrefix(reader.result as string));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const blobToBase64Payload = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(stripDataUrlPrefix(reader.result as string));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const mimeToExtension = (mimeType: string) => {
    switch (mimeType) {
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      case "image/jpeg":
      case "image/jpg":
        return "jpg";
      default:
        return "bin";
    }
  };

  const buildPhotoFileName = (roomName: string, itemType: string, index: number, mimeType: string) => {
    const base = `${roomName || "room"}_${itemType || "item"}_${index + 1}`
      .replace(/[^\w.-]/g, "_");
    const ext = mimeToExtension(mimeType);
    return `${base}.${ext}`;
  };

  const generatePdfPayload = async () => {
    const element = document.getElementById("measurement-preview-content");
    if (!element) {
      throw new Error("Preview content not found.");
    }

    const images = element.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          if (!img.crossOrigin) {
            img.crossOrigin = "anonymous";
          }
        });
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    const originalOverflow = element.style.overflow;
    const originalMaxHeight = element.style.maxHeight;
    element.style.overflow = "visible";
    element.style.maxHeight = "none";

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1200,
      imageTimeout: 15000,
      onclone: (clonedDoc) => {
        const clonedImages = clonedDoc.querySelectorAll("img");
        clonedImages.forEach((img: HTMLImageElement) => {
          img.crossOrigin = "anonymous";
        });
      },
    });

    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Canvas generation failed.");
    }

    let imgData: string;
    try {
      imgData = canvas.toDataURL("image/png", 1.0);
      if (!imgData || imgData === "data:,") {
        throw new Error("Invalid PNG data");
      }
    } catch (pngError) {
      console.warn("PNG generation failed, trying JPEG:", pngError);
      imgData = canvas.toDataURL("image/jpeg", 0.95);
    }

    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    let heightLeft = imgHeight;
    let position = 0;

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

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
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

    const timestamp = new Date().toISOString().split("T")[0];
    const safeDeal = String(dealId || "Unknown").replace(/[^\w.-]/g, "_");
    const fileName = `Measurement_${safeDeal}_${timestamp}.pdf`;

    const pdfBlob = pdf.output("blob");
    const base64Data = await blobToBase64Payload(pdfBlob);

    return {
      fileName,
      mimeType: "application/pdf",
      base64Data,
    };
  };

  const uploadRoomsPhotos = async (roomsToUpload: any[]) => {
    const updatedRooms = await Promise.all(
      (roomsToUpload || []).map(async (room: any) => {
        const updatedItems = await Promise.all(
          (room.items || []).map(async (item: any) => {
            const photos = Array.isArray(item.photos) ? item.photos : [];
            if (photos.length === 0) {
              return { ...item, photos: [] };
            }

            const uploadedUrls = await Promise.all(
              photos.map(async (photo: any, index: number) => {
                if (!photo) return null;

                if (typeof photo === "string") {
                  if (/^https?:\/\//i.test(photo)) return photo;
                  const mimeType = getDataUrlMimeType(photo);
                  const base64Data = stripDataUrlPrefix(photo);
                  const fileName = buildPhotoFileName(room.roomName, item.type, index, mimeType);
                  return uploadFileToStorageAction(
                    fileName,
                    mimeType,
                    base64Data,
                    "measurements/photos"
                  );
                }

                if (photo instanceof File) {
                  const mimeType = photo.type || "image/jpeg";
                  const base64Data = await fileToBase64Payload(photo);
                  const fileName = photo.name || buildPhotoFileName(room.roomName, item.type, index, mimeType);
                  return uploadFileToStorageAction(
                    fileName,
                    mimeType,
                    base64Data,
                    "measurements/photos"
                  );
                }

                return null;
              })
            );

            return {
              ...item,
              photos: uploadedUrls.filter(Boolean),
            };
          })
        );

        return {
          ...room,
          items: updatedItems,
        };
      })
    );

    return updatedRooms;
  };

  // Panel Helper 
  const generatePanelSplitOptions = (panels: string | number) => {
  const n = Number(panels);
  if (!n || n <= 0) return [];

  const result: string[] = [];

  for (let left = 0.5; left <= n / 2; left += 0.5) {
    const right = Number((n - left).toFixed(1));
    result.push(`${left} + ${right}`);
  }

  return result;
};


//========================Local data storage ==============
// ─── Save data to storage for data Protection ────────────────────────────────────────
  const [draftData, setDraftData] = useState<any>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  const draftKey = `measurement_draft_${visitId}`;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!visitId) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      await localStorage.setItem(
        draftKey,
        JSON.stringify({
          customerName,
          dealId,
          rooms,
          currentRoom,
          currentItems,
          currentExtra,
          itemPhotos,
          doerName,
        }),
      );
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [customerName, dealId, rooms, currentRoom, currentItems]);
  //=====================================UI caller

  useEffect(() => {
    if (!visitId) return;

    const checkDraft = async () => {
      const saved = await localStorage.getItem(draftKey);
      if (saved) {
        setDraftData(JSON.parse(saved));
        setShowDraftPrompt(true);
      }
    };

    checkDraft();
  }, [visitId]);

  // Handle Preview And Save
  const handlePreview = async () => {
  try {
    // 🔒 Validation
    if (!customerName || !dealId) {
      alert("Please fill in customer name and deal ID");
      return;
    }

    if (rooms.length === 0) {
      alert("Please add at least one room");
      return;
    }

    // 🔄 Convert photos to base64
    const roomsWithBase64 = await Promise.all(
      rooms.map(async (room) => ({
        ...room,
        roomName: room.roomName || "Unnamed Room",
        items: await Promise.all(
          room.items.map(async (item: any) => ({
            ...item,
            type: item.type || "unknown",
            data: item.data || {},
            photos: item.photos && Array.isArray(item.photos)
              ? await Promise.all(
                  item.photos
                    .map(async (photo: any) => {
                      if (photo instanceof File) {
                        return fileToDataUrl(photo);
                      }
                      if (typeof photo === "string") {
                        return photo;
                      }
                      return null;
                    })
                )
                  .then((results) => results.filter(Boolean))
              : [],
          }))
        ),
      }))
    );

    // ✅ Set preview data
    setPreviewData({
      visitId,
      customerName,
      dealId,
      typeOfWork: "", // optional if you add later
      doerName,
      rooms: roomsWithBase64,
    });

    setPreviewOpen(true);
  } catch (error) {
    console.error("Error preparing preview:", error);
    alert("Failed to prepare preview. Please check your data.");
  }
};

//Handle Save 
const handleSave = async () => {
  if (saving) return;

  try {
    if (!previewData) throw new Error("Preview data missing");

    const visitIdToSend = previewData.visitId || visitId;
    if (!visitIdToSend) {
      alert("Visit ID missing. Please reopen from your tasks.");
      return;
    }

    // ✅ Must have Firestore IDs to save in same path as old
    if (!fsCustomerId || !fsDealId) {
      throw new Error("Firestore customerId/dealId missing. Pass them in URL or resolve from visitId.");
    }

    setSaving(true);
    setSaveStep("pdf");

    const safeDoer = (doerName || "").trim() || "System";
    const safeCreatedBy = (createdby || "").trim() || safeDoer;

    const pdfPayload = await generatePdfPayload();

    setSaveStep("upload");

    const roomsForUpload = (rooms || []).map((room) => ({
      ...room,
      roomName: room.roomName || "Unnamed Room",
    }));

    const [pdfUrl, roomsWithPhotoUrls] = await Promise.all([
      uploadFileToStorageAction(
        pdfPayload.fileName,
        pdfPayload.mimeType,
        pdfPayload.base64Data,
        "measurements/pdfs"
      ),
      uploadRoomsPhotos(roomsForUpload),
    ]);

    setSaveStep("sheet");

    // ✅ Debug: confirm what backend will receive
    console.log("📤 [SAVE:ACTION] Calling saveMeasurementToDeal with:", {
      customerId: fsCustomerId,
      dealId: fsDealId,
      visitId: visitIdToSend,
      typeOf: previewData.typeOfWork,
      doerName: safeDoer,
      createdBy: safeCreatedBy,
      roomsCount: previewData.rooms?.length || 0,
    });

    await saveMeasurementToDeal({
      customerId: fsCustomerId,
      dealId: fsDealId,
      visitId: visitIdToSend,
      typeOf: previewData.typeOfWork || null,
      doerName: safeDoer,
      rooms: roomsWithPhotoUrls,
      createdBy: safeCreatedBy,
      status: "completed",
      flags: [],
      pdfUrl,
    });

    setSaveStep("done");

    toast("Saved", { description: "Measurement saved successfully" });

    setTimeout(() => {
      setPreviewOpen(false);
      router.back(); // same behavior as old
      setSaveStep("idle");
      setSaving(false);
    }, 800);
  } catch (e: any) {
    console.error("❌ [SAVE:ACTION] Error:", e);

    setSaveStep("error");
    setSaving(false);

    toast("Save failed", { description: e.message || "Something went wrong" });
  }
};


  // Add or Update Item
  const handleAddItem = () => {
    if (!itemType) {
      alert("Please select an item type");
      return;
    }

    const newItem = {
      type: itemType,
      data: { ...itemData, extras: itemExtras },
      remark: itemRemark,
      photos: itemPhotos,
    };

    if (editingItemIndex !== null) {
      const updated = [...currentItems];
      updated[editingItemIndex] = newItem;
      setCurrentItems(updated);
    } else {
      setCurrentItems([...currentItems, newItem]);
    }

    resetItemForm();
  };

  // Edit Item
  const handleEditItem = (index: number) => {
    const item = currentItems[index];
    setItemType(item.type);
    setItemData(item.data);
    setItemRemark(item.remark);
    setItemPhotos(item.photos);
    setItemExtras(item.data.extras || []);
    setEditingItemIndex(index);
  };

  // Delete Item
  const handleDeleteItem = (index: number) => {
    setCurrentItems(currentItems.filter((_, i) => i !== index));
  };

  // Save Room
  const handleSaveRoom = () => {
    if (!currentRoom) {
      alert("Please enter a room name");
      return;
    }

    if (currentItems.length === 0) {
      alert("Please add at least one item");
      return;
    }

    const roomData = {
      roomName: currentRoom,
      items: currentItems,
    };

    if (currentRoomIndex !== null) {
      const updated = [...rooms];
      updated[currentRoomIndex] = roomData;
      setRooms(updated);
    } else {
      setRooms([...rooms, roomData]);
    }

    setCurrentRoom("");
    setCurrentItems([]);
    setCurrentRoomIndex(null);
    resetItemForm();
  };

  // Edit Room
  const handleEditRoom = (index: number) => {
    const room = rooms[index];
    setCurrentRoom(room.roomName);
    setCurrentItems(room.items);
    setCurrentRoomIndex(index);
  };

  // Delete Room
  const handleDeleteRoom = (index: number) => {
    setRooms(rooms.filter((_, i) => i !== index));
  };

  // Render dynamic fields based on item type
  const renderItemFields = () => {
    switch (itemType) {
      case "curtain":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Length</Label>
              <Input
                value={itemData.height || ""}
                onChange={(e) => setItemData({ ...itemData, height: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                value={itemData.width || ""}
                onChange={(e) => {
                  const width = e.target.value;
                  const panels = width ? Math.ceil(Number(width) / 20) : "";
                  setItemData({ ...itemData, width, panels: String(panels) });
                }}
                placeholder="Width"
              />
            </div>
            <div>
              <Label>Panels (Auto)</Label>
              <Input
                  value={itemData.panels || ""}
                  onChange={(e) => {
                    const panels = e.target.value;

                    setItemData({
                      ...itemData,
                      panels,
                      panelsdis: itemData.panelsdis
                        ? itemData.panelsdis // ✋ manual override preserved
                        : generatePanelSplitOptions(panels),
                    });
                  }}
                  placeholder="Panels"
                />
            </div>
            <div className="relative">
              <Label>Panel Details</Label>

              {/* Editable Input */}
              <Input
                value={itemData.panelsdis || ""}
                onChange={(e) =>
                  setItemData({
                    ...itemData,
                    panelsdis: e.target.value,
                  })
                }
                placeholder="Auto split (editable)"
                onFocus={() =>
                  setItemData({
                    ...itemData,
                    _showPanelDropdown: true,
                  })
                }
                onBlur={() =>
                  setTimeout(() => {
                    setItemData((prev: any) => ({
                      ...prev,
                      _showPanelDropdown: false,
                    }));
                  }, 150)
                }
              />

              {/* Dropdown */}
              {itemData._showPanelDropdown &&
                itemData.panels &&
                generatePanelSplitOptions(itemData.panels).length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded border bg-white shadow">
                    {generatePanelSplitOptions(itemData.panels).map((opt, i) => (
                      <div
                        key={i}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
                        onMouseDown={() =>
                          setItemData({
                            ...itemData,
                            panelsdis: opt,
                            _showPanelDropdown: false,
                          })
                        }
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
            </div>

          </div>
        );

      case "blind":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Length (MM)</Label>
              <Input
                value={itemData.height || ""}
                onChange={(e) => setItemData({ ...itemData, height: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div>
              <Label>Width (MM)</Label>
              <Input
                value={itemData.width || ""}
                onChange={(e) => setItemData({ ...itemData, width: e.target.value })}
                placeholder="Width"
              />
            </div>
            <div>
              <Label>Control Side</Label>
              <Select
                value={itemData.control || ""}
                onValueChange={(v) => setItemData({ ...itemData, control: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Left">Left</SelectItem>
                  <SelectItem value="Right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Window Install</Label>
              <Select
                value={itemData.windowInstall || ""}
                onValueChange={(v) => setItemData({ ...itemData, windowInstall: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inside">Inside</SelectItem>
                  <SelectItem value="Outside">Outside</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fitting Type</Label>
              <Select
                value={itemData.fittingType || ""}
                onValueChange={(v) => setItemData({ ...itemData, fittingType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ceiling">Ceiling</SelectItem>
                  <SelectItem value="Wall">Wall</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "furniture":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Item Name</Label>
                <Input
                  value={itemData.name || ""}
                  onChange={(e) => setItemData({ ...itemData, name: e.target.value })}
                  placeholder="Name"
                />
              </div>
              <div>
                <Label>Seats</Label>
                <Input
                  value={itemData.seats || ""}
                  onChange={(e) => setItemData({ ...itemData, seats: e.target.value })}
                  placeholder="Seats"
                />
              </div>
              <div>
                <Label>Fabric Qty</Label>
                <Input
                  value={itemData.fabqty || ""}
                  onChange={(e) => setItemData({ ...itemData, fabqty: e.target.value })}
                  placeholder="Qty"
                />
              </div>
              <div>
                <Label>Rate/Seat</Label>
                <Input
                  value={itemData.rate || ""}
                  onChange={(e) => setItemData({ ...itemData, rate: e.target.value })}
                  placeholder="Rate"
                />
              </div>
            </div>

            {/* Extras Section */}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExtraDialogOpen(true)}
              >
                <Plus size={14} className="mr-1" /> Add Extra Item
              </Button>

              {itemExtras.length > 0 && (
                <div className="mt-2 space-y-2">
                  {itemExtras.map((ex, i) => (
                    <div key={i} className="flex justify-between items-center border p-2 rounded text-sm">
                      <div>
                        <span className="font-medium capitalize">{ex.type}</span>
                        {ex.type === "foam" && (
                          <span className="text-xs text-gray-600 ml-2">
                            Size: {ex.size}, Density: {ex.density}, Qty: {ex.qty}
                          </span>
                        )}
                        {ex.type === "stitching" && (
                          <span className="text-xs text-gray-600 ml-2">Rate: ₹{ex.rate}</span>
                        )}
                        {(ex.type === "niwar" || ex.type === "velcro" || ex.type === "zipper") && (
                          <span className="text-xs text-gray-600 ml-2">Qty: {ex.qty}</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExtra(i)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case "wallpaper":
        return (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Length</Label>
              <Input
                value={itemData.height || ""}
                onChange={(e) => setItemData({ ...itemData, height: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                value={itemData.width || ""}
                onChange={(e) => setItemData({ ...itemData, width: e.target.value })}
                placeholder="Width"
              />
            </div>
            <div>
              <Label>Uses</Label>
              <Select
                value={itemData.uses || ""}
                onValueChange={(v) => setItemData({ ...itemData, uses: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wall">Wall</SelectItem>
                  <SelectItem value="Celling">Ceiling</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "woodenflooring":
        return (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Length</Label>
              <Input
                value={itemData.height || ""}
                onChange={(e) => setItemData({ ...itemData, height: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                value={itemData.width || ""}
                onChange={(e) => setItemData({ ...itemData, width: e.target.value })}
                placeholder="Width"
              />
            </div>
            <div>
              <Label>Skirting</Label>
              <Input
                value={itemData.skirting || ""}
                onChange={(e) => setItemData({ ...itemData, skirting: e.target.value })}
                placeholder="Skirting"
              />
            </div>
            <div>
              <Label>Profile</Label>
              <Input
                value={itemData.profile || ""}
                onChange={(e) => setItemData({ ...itemData, profile: e.target.value })}
                placeholder="Profile"
              />
            </div>
            <div>
              <Label>Beading</Label>
              <Input
                value={itemData.beading || ""}
                onChange={(e) => setItemData({ ...itemData, beading: e.target.value })}
                placeholder="Beading"
              />
            </div>
          </div>
        );

      case "carpetflooring":
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Length</Label>
              <Input
                value={itemData.height || ""}
                onChange={(e) => setItemData({ ...itemData, height: e.target.value })}
                placeholder="Length"
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                value={itemData.width || ""}
                onChange={(e) => setItemData({ ...itemData, width: e.target.value })}
                placeholder="Width"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold">Measurement Entry</h1>

      {/* HEADER INFO */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Customer Name *</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Auto-filled from params"
              className="bg-gray-50"
            />
          </div>
          <div>
            <Label>Deal ID *</Label>
            <Input
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="Auto-filled from params"
              className="bg-gray-50"
            />
          </div>
          <div>
            <Label>Installer</Label>
            <Input 
              value={doerName} 
              readOnly 
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </CardContent>
      </Card>

      {/* ROOM & ITEM ENTRY */}
      <Card>
        <CardHeader>
          <CardTitle>{currentRoomIndex !== null ? "Edit Room" : "Add Room"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Room Name *</Label>
            <Input
              value={currentRoom}
              onChange={(e) => setCurrentRoom(e.target.value)}
              placeholder="Enter room name"
            />
          </div>

          <div>
            <Label>Item Type *</Label>
            <Select value={itemType} onValueChange={setItemType}>
              <SelectTrigger>
                <SelectValue placeholder="Select item type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="curtain">🪟 Curtain</SelectItem>
                <SelectItem value="blind">🪟 Blind</SelectItem>
                <SelectItem value="furniture">🛋 Furniture</SelectItem>
                <SelectItem value="wallpaper">📄 Wallpaper</SelectItem>
                <SelectItem value="woodenflooring">🪵 Wooden Flooring</SelectItem>
                <SelectItem value="carpetflooring">🧱 Carpet Flooring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {renderItemFields()}

          <div>
            <Label>Remark</Label>
            <Textarea
              value={itemRemark}
              onChange={(e) => setItemRemark(e.target.value)}
              placeholder="Add remarks"
            />
          </div>

          <div>
            <Label>Photos</Label>
            <div className="flex gap-2 flex-wrap mb-2">
              {itemPhotos.map((file, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="preview"
                    className="w-16 h-16 object-cover rounded border"
                  />
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1"
                    onClick={() => removePhoto(i)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <Input
              type="file"
              multiple
              accept="image/*"
              onChange={handlePhotoChange}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddItem} className="flex-1">
              <Plus size={16} className="mr-2" />
              {editingItemIndex !== null ? "Update Item" : "Add Item"}
            </Button>
            {editingItemIndex !== null && (
              <Button variant="outline" onClick={resetItemForm}>
                Cancel Edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ITEMS TABLE */}
      {currentItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Items in {currentRoom || "Current Room"} ({currentItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 w-full border text-center">Sr</th>
                    <th className="p-2 border">Type</th>
                    <th className="p-2  border">Item Details Per Rooms </th>
                    <th className="p-2 border">Extra</th>
                    <th className="p-2 border">Remark</th>
                    <th className="p-2 border text-center">Photos</th>
                    <th className="p-2 border w-32 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-2 border text-center">{idx + 1}</td>
                      <td className="p-2 border capitalize font-medium">{item.type}</td>
                      <td className="p-2 border text-xs">
                        {item.type === "curtain" && (
                          <div className="w-30">L: {item.data.height}, W: {item.data.width}, P: {item.data.panels}, OP: {item.data.panelsdis}</div>
                        )}
                        {item.type === "blind" && (
                          <div>
                            {item.data.height} × {item.data.width} MM<br />
                            {item.data.control} | {item.data.windowInstall}
                          </div>
                        )}
                        {item.type === "furniture" && (
                          <div className="w-45">
                            {item.data.name} | Seats: {item.data.seats}<br />
                            Qty: {item.data.fabqty} Mtr | Rate :₹{item.data.rate}/Seat
                          </div>
                        )}
                        {item.type === "wallpaper" && (
                          <div>{item.data.height} × {item.data.width} | {item.data.uses}</div>
                        )}
                        {(item.type === "woodenflooring" || item.type === "carpetflooring") && (
                          <div>{item.data.height} × {item.data.width}</div>
                        )}
                      </td>
                      <td className="p-2 border text-xs">
                        {item.data.extras && item.data.extras.length > 0 ? (
                          <div className="space-y-1 w-52">
                            {item.data.extras.map((ex: any, i: number) => (
                              <div
                                key={i}
                                className="rounded bg-blue-50 px-2 py-1 border border-blue-200"
                              >
                                <div className="font-medium capitalize text-blue-700">
                                  {ex.type}
                                </div>

                                {ex.type === "foam" && (
                                  <div className="text-gray-700">
                                    Size: {ex.size} | Density: {ex.density} | Qty: {ex.qty}
                                  </div>
                                )}

                                {ex.type === "stitching" && (
                                  <div className="text-gray-700">
                                    Rate: ₹{ex.rate}
                                  </div>
                                )}
                                {(ex.type === "niwar" ||
                                  ex.type === "Marking" ||
                                  ex.type === "casement") && (
                                  <div className="text-gray-700">
                                    Qty: {ex.qty}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="p-2 border text-xs">{item.remark || "-"}</td>
                      <td className="p-2 border text-center">{item.photos.length}</td>
                      <td className="p-2 border">
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditItem(idx)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteItem(idx)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button onClick={handleSaveRoom} className="w-full mt-4">
              {currentRoomIndex !== null ? "Update Room" : "Save Room"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SAVED ROOMS */}
      {rooms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Rooms ({rooms.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rooms.map((room, idx) => (
              <div key={idx} className="border rounded p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg">{room.roomName}</h3>
                    <p className="text-sm text-gray-600">{room.items.length} item(s)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditRoom(idx)}
                    >
                      <Pencil size={14} className="mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteRoom(idx)}
                    >
                      <Trash2 size={14} className="mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ACTIONS */}
      <div className="flex gap-4">
        <Button variant="outline" className="flex-1">Cancel</Button>
        <Button
          type="button"
          className="w-1/2"
          onClick={handlePreview}
        >
          👁 Preview
        </Button>
      </div>

      {/* EXTRA DIALOG */}
      <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Extra Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select
                value={currentExtra.type}
                onValueChange={(v) => setCurrentExtra({ type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foam">Foam</SelectItem>
                  <SelectItem value="Marking">Marking</SelectItem>
                  <SelectItem value="niwar">Niwar</SelectItem>
                  <SelectItem value="casement">Casement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentExtra.type === "foam" && (
              <>
                <div>
                  <Label>Size</Label>
                    <Select
                      value={currentExtra.size || ""}
                      onValueChange={(value) =>
                        setCurrentExtra({ ...currentExtra, size: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="72*35*4"> 72×35×4" </SelectItem>
                        <SelectItem value="72*35*3"> 72×35×3" </SelectItem>
                        <SelectItem value="72*35*2"> 72×35×2" </SelectItem>
                        <SelectItem value="72*35*1"> 72×35×1" </SelectItem>
                        <SelectItem value="72*35*0.5"> 72×35×1/2" </SelectItem>
                        <SelectItem value="21*22*4"> 21×22×4" </SelectItem>
                      </SelectContent>
                    </Select>

                </div>
                <div>
                  <Label>Density</Label>
                  <Input
                    value={currentExtra.density || ""}
                    onChange={(e) => setCurrentExtra({ ...currentExtra, density: e.target.value })}
                    placeholder="e.g., 40"
                  />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={currentExtra.qty || ""}
                    onChange={(e) => setCurrentExtra({ ...currentExtra, qty: e.target.value })}
                    placeholder="Qty"
                  />
                </div>
              </>
            )}

            {currentExtra.type === "stitching" && (
              <div>
                <Label>Rate</Label>
                <Input
                  type="number"
                  value={currentExtra.rate || ""}
                  onChange={(e) => setCurrentExtra({ ...currentExtra, rate: e.target.value })}
                  placeholder="Rate"
                />
              </div>
            )}

            {(currentExtra.type === "niwar" || currentExtra.type === "Marking" || currentExtra.type === "casement") && (
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={currentExtra.qty || ""}
                  onChange={(e) => setCurrentExtra({ ...currentExtra, qty: e.target.value })}
                  placeholder="Qty"
                />
              </div>
            )}

            <Button onClick={handleAddExtra} className="w-full">
              Add Extra
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ===================== Draft Data Load dialog ======================== */}
      <AlertDialog open={showDraftPrompt} onOpenChange={setShowDraftPrompt}>
        <AlertDialogContent className="max-w-sm rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle >
              <span className="flex-row gap-2"><AlertTriangleIcon color="red" size={24} /> Draft Found !!</span></AlertDialogTitle>
            <AlertDialogDescription>
              We found the saved draft of this entries!! want to restore them. 
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-between items-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={ () => {
                setCustomerName(draftData.customerName || "");
                setDealId(draftData.dealId || "");
                setRooms(draftData.rooms || []);
                setCurrentRoom(draftData.currentRoom || "");
                setCurrentItems(draftData.currentItems || []);
                setDoerName(draftData.doerName || "");

                setShowDraftPrompt(false);

                toast.success("Data loaded Successfully.");
              }}
            >
            Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MeasurementPreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          data={previewData}
          onSave={handleSave}
          saving={saving}
          saveStep={saveStep}
        />
    </div>
  );
}
