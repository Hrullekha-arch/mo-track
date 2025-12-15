"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DealProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { roomOptions } from "@/lib/constants";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import Hardwareform from "./Hardwareform";

const blindEntrySchema = z.object({
  id: z.string(),
  blindType: z.enum(["Roman Blind", "Roller Blind", "Normal Blind"]).optional(),
  shadeNo: z.string().optional(),
  width: z.string().optional(),
  widthUnit: z.string().optional().default("inch"),
  height: z.string().optional(),
  heightUnit: z.string().optional().default("inch"),
  operating: z.enum(["Manual", "motorized"]).optional(),
  usesType: z
    .enum(["Direct Fix", "Head Rail", "Plain Cassette", "Decorative Cassette", "One Touch Up", "Moto Down"])
    .optional(),
  motorType: z.enum(["Simotic or Ebony (RTS | WT)", "Wire Free (RTS)"]).optional(),
  remoteType: z.string().optional(),
  control: z.enum(["LHT", "RHT"]).optional(),
  bracket: z.enum(["Wall", "Celling"]).optional(),
  bottomChannel: z.enum(["Square", "Rounded", "Fabric Covered"]).optional(),
  bottomRailColor: z.string().optional(),
  otherBottomRailColor: z.string().optional(),
  locationOfBlind: z.string().optional(),
  noOfBlind: z.string().optional(),
});

const newProductEntrySchema = z.object({
  collectionBrand: z.string().min(1, "BCN is required."),
  salesDescription: z.string().optional().default(""),
  mrp: z.string().optional().default(""),
  verticalRepeat: z.string().optional().default(""),
  horizontalRepeat: z.string().optional().default(""),
  quantity: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
});

const productListSchema = z.object({
  room: z.string().optional(),
  newProduct: newProductEntrySchema,
});

type ProductListFormValues = z.infer<typeof productListSchema>;
type BlindEntryFormValues = z.infer<typeof blindEntrySchema>;

const AddBlindsDialog = ({
  isOpen,
  onClose,
  roomName,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  onSave: (products: DealProduct[]) => void;
}) => {
  const { toast } = useToast();
  const [localBlinds, setLocalBlinds] = useState<Partial<BlindEntryFormValues>[]>([
    { id: new Date().toISOString() },
  ]);

  const handleSave = () => {
    const blindsToSave = localBlinds.map(
      (blind) =>
        ({
          ...blind,
          isBlind: true,
          room: roomName,
          id: `blind-${Date.now()}-${Math.random()}`,
          collectionBrand: blind.shadeNo || "N/A",
        } as DealProduct)
    );

    onSave(blindsToSave);
    toast({
      title: "Blinds Added",
      description: `${blindsToSave.length} blind(s) staged. Use Update Activity to save.`,
    });
    onClose();
  };

  const updateLocalBlind = (index: number, field: keyof BlindEntryFormValues, value: any) => {
    const newBlinds = [...localBlinds];
    newBlinds[index] = { ...newBlinds[index], [field]: value };
    setLocalBlinds(newBlinds);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Blinds for {roomName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh]">
          <div className="py-4 space-y-4 pr-4">
            {localBlinds.map((blind, index) => {
              const isMotorized = blind.operating === "motorized";
              const showOtherColor = blind.bottomRailColor === "Other";
              return (
                <Card key={blind.id} className="p-4 relative">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => setLocalBlinds((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <p className="font-semibold mb-3">Blind #{index + 1}</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormItem>
                      <FormLabel>Blind Type</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "blindType", val)} value={blind.blindType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Roman Blind">Roman Blind</SelectItem>
                          <SelectItem value="Roller Blind">Roller Blind</SelectItem>
                          <SelectItem value="Normal Blind">Normal Blind</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Shade No</FormLabel>
                      <Input value={blind.shadeNo} onChange={(e) => updateLocalBlind(index, "shadeNo", e.target.value)} />
                    </FormItem>
                    <FormItem>
                      <FormLabel>Width</FormLabel>
                      <div className="flex items-center gap-1">
                        <Input value={blind.width} onChange={(e) => updateLocalBlind(index, "width", e.target.value)} />
                        <Select onValueChange={(val) => updateLocalBlind(index, "widthUnit", val)} value={blind.widthUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">inch</SelectItem>
                            <SelectItem value="mm">mm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Height</FormLabel>
                      <div className="flex items-center gap-1">
                        <Input value={blind.height} onChange={(e) => updateLocalBlind(index, "height", e.target.value)} />
                        <Select onValueChange={(val) => updateLocalBlind(index, "heightUnit", val)} value={blind.heightUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">inch</SelectItem>
                            <SelectItem value="mm">mm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Operating</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "operating", val)} value={blind.operating}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Operating" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Manual">Manual</SelectItem>
                          <SelectItem value="motorized">motorized</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Uses Type</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "usesType", val)} value={blind.usesType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Uses Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Direct Fix">Direct Fix</SelectItem>
                          <SelectItem value="Head Rail">Head Rail</SelectItem>
                          <SelectItem value="Plain Cassette">Plain Cassette</SelectItem>
                          <SelectItem value="Decorative Cassette">Decorative Cassette</SelectItem>
                          <SelectItem value="One Touch Up">One Touch Up</SelectItem>
                          <SelectItem value="Moto Down">Moto Down</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    {isMotorized && (
                      <FormItem>
                        <FormLabel>Motor Type</FormLabel>
                        <Select onValueChange={(val) => updateLocalBlind(index, "motorType", val)} value={blind.motorType}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Motor Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Simotic or Ebony (RTS | WT)">Simotic or Ebony (RTS | WT)</SelectItem>
                            <SelectItem value="Wire Free (RTS)">Wire Free (RTS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                    {isMotorized && (
                      <FormItem>
                        <FormLabel>Remote Type</FormLabel>
                        <Input
                          value={blind.remoteType}
                          onChange={(e) => updateLocalBlind(index, "remoteType", e.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Control</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "control", val)} value={blind.control}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Control" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LHT">LHT</SelectItem>
                          <SelectItem value="RHT">RHT</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bracket</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "bracket", val)} value={blind.bracket}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Bracket" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Wall">Wall</SelectItem>
                          <SelectItem value="Celling">Celling</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bottom Channel</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "bottomChannel", val)}
                        value={blind.bottomChannel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Square">Square</SelectItem>
                          <SelectItem value="Rounded">Rounded</SelectItem>
                          <SelectItem value="Fabric Covered">Fabric Covered</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bottom Rail Color</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "bottomRailColor", val)}
                        value={blind.bottomRailColor}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Matching">Matching</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    {showOtherColor && (
                      <FormItem>
                        <FormLabel>Specify Color</FormLabel>
                        <Input
                          value={blind.otherBottomRailColor}
                          onChange={(e) => updateLocalBlind(index, "otherBottomRailColor", e.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Location of Blind</FormLabel>
                      <Input
                        value={blind.locationOfBlind}
                        onChange={(e) => updateLocalBlind(index, "locationOfBlind", e.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <FormLabel>No Of Blind (Pcs)</FormLabel>
                      <Input
                        type="number"
                        value={blind.noOfBlind}
                        onChange={(e) => updateLocalBlind(index, "noOfBlind", e.target.value)}
                      />
                    </FormItem>
                  </div>
                </Card>
              );
            })}
            <Button variant="outline" onClick={() => setLocalBlinds((prev) => [...prev, { id: new Date().toISOString() }])}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Another Blind
            </Button>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={handleSave}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type ProductFormProps = {
  initialProducts: DealProduct[];
  onProductsUpdated: (products: DealProduct[]) => void;
  onRefresh: () => void;
  blindDialogState: { isOpen: boolean; roomName: string | null };
  setBlindDialogState: (state: { isOpen: boolean; roomName: string | null }) => void;
};

export function ProductForm({
  initialProducts,
  onProductsUpdated,
  onRefresh: _onRefresh,
  blindDialogState,
  setBlindDialogState,
}: ProductFormProps) {
  const { toast } = useToast();
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const [activeMainSection, setActiveMainSection] = useState("main");

  const form = useForm<ProductListFormValues>({
    resolver: zodResolver(productListSchema),
    defaultValues: {
      room: "",
      newProduct: {
        collectionBrand: "",
        salesDescription: "",
        mrp: "",
        verticalRepeat: "",
        horizontalRepeat: "",
        quantity: "",
        remarks: "",
      },
    },
  });

  const handleBcnSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setBcnOptions([]);
        return;
      }
      try {
        const results = await searchStockByBcn(query);
        const options = results.map((stock) => ({
          value: stock.bcn || stock.id,
          label: `${stock.bcn}`,
          stockItem: stock,
        }));
        setBcnOptions(options as any);
      } catch (error) {
        console.error("Error searching BCN:", error);
        toast({ variant: "destructive", title: "Search failed" });
      }
    },
    [toast]
  );

  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find((opt) => opt.value === value) as any;
    if (selectedOption) {
      const stockItem = selectedOption.stockItem;
      form.setValue("newProduct.collectionBrand", stockItem.bcn || stockItem.id);
      form.setValue("newProduct.mrp", (stockItem.mrp || 0).toString());
      form.setValue("newProduct.salesDescription", "");
    }
  };

  // ⭐ ADD THIS INSIDE ProductForm (top-level inside the component)
const handleSaveHardware = (payload) => {
  console.log("✔️ Hardware Saved:", payload);

  setStagedItems((prev) => [
    ...prev,
    {
      id: `hardware-${Date.now()}`, 
      productType: "Hardware",
      productCategory: payload.productCategory,
      subCategory: payload.subCategory,
      bcn: payload.bcn || null,
      rate: payload.rate || "",
      quantity: payload.quantity || "",
      image: payload.image || null,
      timestamp: payload.timestamp,
    },
  ]);
};


useEffect(() => {
  const raw = localStorage.getItem("hardwarePayload");
  if (!raw) return;

  let hardwareItems = [];

  try {
    hardwareItems = JSON.parse(raw);
  } catch {
    console.error("Invalid hardwarePayload JSON");
    return;
  }

  if (!Array.isArray(hardwareItems)) return;

  const normalizedItems = hardwareItems.map((hw) => {
    // 🟦 1. Extract legacy structure
    const oldCategory = hw.items?.itemCategory || null;
    const oldLabel = hw.items?.itemLabel || null;
    const oldQty = hw.items?.itemQty || null;
    const oldRate = hw.items?.itemRate || null;

    // 🟩 2. Extract new structure
    const newCategory = hw.category || null;
    const newType = hw.type || null;

    // Final classification
    const finalCategory = newCategory || oldCategory || "Hardware";
    const finalLabel = newType || oldLabel || finalCategory;

    // 🟧 3. Build safe unique ID
    const finalId = `${finalCategory}-${finalLabel}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      ...hw,

      // Required by staged items
      id: finalId,

      // Shown in product chip UI
      collectionBrand: finalLabel,

      // Standard values
      quantity: hw.quantity || oldQty || "1",
      rate: hw.rate || oldRate || "",

      // Identify this as hardware for AddedProduct
      productSource: "Hardware",
    };
  });

  // Append to staged items
  setStagedItems((prev) => [...prev, ...normalizedItems]);

  // Clean up
  localStorage.removeItem("hardwarePayload");
}, []);



const handleStageItem = () => {
  const newProduct = form.getValues("newProduct");

  const sourceTag =
    activeMainSection === "fabric"
      ? "fabric"
      : activeMainSection === "wallpaper"
      ? "wallpaper"
      : activeMainSection === "flooring"
      ? "flooring"
      : "other";

  setStagedItems((prev) => [
    ...prev,
    {
      ...newProduct,
      productSource: sourceTag,
      flooringType: selectedFlooringType || newProduct.Type || null,
    },
  ]);

  form.reset({
    ...form.getValues(),
    newProduct: {
      Type: "",
      collectionBrand: "",
      salesDescription: "",
      mrp: "",
      quantity: "",
      remarks: "",
      verticalRepeat: "",
      horizontalRepeat: "",
    },
  });
};

  const [step, setStep] = useState("main");

  const choose = (type) => {
    onSelect(type);   // send selected type
    setStep("main");  // reset
    onClose();        // close dialog
  };

  const handleAddProductsToList = () => {
    const room = form.getValues("room");
    if (!room) {
      toast({ variant: "destructive", title: "Missing Room", description: "Please select a room first." });
      return;
    }
    if (stagedItems.length === 0) {
      toast({ variant: "destructive", title: "No Items", description: "Please add at least one item to stage." });
      return;
    }
    const timestamp = Date.now();
    const newProductsForForm: DealProduct[] = stagedItems.map((item, index) => {
      const label = (item as any).collectionBrand || (item as any).items?.itemLabel || "item";
      return {
        ...(item as any),
        collectionBrand: (item as any).collectionBrand || label,
        quantity: (item as any).quantity ?? (item as any).items?.itemQty ?? "0",
        room,
        isBlind: false,
        id: `${label}-${timestamp}-${index}`,
      };
    });

    onProductsUpdated([...initialProducts, ...newProductsForForm]);
    setStagedItems([]);
    toast({ title: "Products Added", description: `${newProductsForForm.length} item(s) added to the list.` });
  };

  const handleBlindsAdded = (blinds: DealProduct[]) => {
    onProductsUpdated([...initialProducts, ...blinds]);
  };

  const selectedRoom = form.watch("room");
    const [flooringDialogOpen, setFlooringDialogOpen] = useState(false);
    const [selectedFlooringType, setSelectedFlooringType] = useState("");

    const handleSelectFlooring = (type) => {
    setSelectedFlooringType(type);
    setActiveMainSection("flooring");
    setFlooringDialogOpen(false);
    };




  return (
    <FormProvider {...form}>
      <Card className="mt-6">
        <CardContent className="p-6">
          <form className="space-y-4">
            <div className="space-y-4">
              {activeMainSection === "main" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Products</h3>

                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="p-4 border rounded-xl flex flex-col gap-3">
                        <button
                          type="button"
                          className="border rounded-lg py-2 px-3 hover:bg-muted transition"
                          onClick={() => setActiveMainSection("fabric")}
                        >
                          Furnishing Fabric
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setActiveMainSection("wallpaper")
                          }
                          className="border rounded-lg py-2 px-3 hover:bg-muted transition"
                        >
                          Wallpaper
                        </button>

                        <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFlooringDialogOpen(true)}
                        >
                        Flooring
                        </Button>

                      </div>

                      <div className="p-4 border rounded-xl flex flex-col gap-3">
                        <Hardwareform form={form} onSaveHardware={handleSaveHardware}/>
                      </div>
                    </div>
                  </div>
                </div>
              )}
{/* ///////////////////////////////////////========================fabric section */}
              {activeMainSection === "fabric" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Product</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <div className="md:col-span-2 flex items-end gap-2">
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setBlindDialogState({ isOpen: true, roomName: selectedRoom });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BCN*</FormLabel>
                            <Combobox
                              options={bcnOptions}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                                handleBcnSelect(value);
                              }}
                              onSearch={handleBcnSearch}
                              placeholder="Search by BCN..."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qty</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}

{/* /////////////////==========================Wallpaper section */     }
                            {activeMainSection === "wallpaper" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Wallpaper</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Room*</FormLabel>
                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="md:col-span-2 flex items-end gap-2">
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setBlindDialogState({ isOpen: true, roomName: selectedRoom });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BCN*</FormLabel>
                            <Combobox
                              options={bcnOptions}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                                handleBcnSelect(value);
                              }}
                              onSearch={handleBcnSearch}
                              placeholder="Search by BCN..."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qty</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {/* ////////////////================flooring dialog / */}
                        <Dialog open={flooringDialogOpen} onOpenChange={setFlooringDialogOpen}>
                        <DialogContent className="max-w-[350px]">
                            <DialogHeader>
                            <DialogTitle>Flooring Options</DialogTitle>
                            </DialogHeader>

                            {step === "main" && (
                            <div className="grid gap-3 py-4">
                                <Button variant="outline" onClick={() => handleSelectFlooring("Wooden Flooring")}>
                                Wooden Flooring
                                </Button>

                                <Button variant="outline" onClick={() => setStep("carpet")}>
                                Carpet Flooring
                                </Button>
                            </div>
                            )}

                            {step === "carpet" && (
                            <div className="grid gap-3 py-4">
                                <Button variant="outline" onClick={() => handleSelectFlooring("Normal Carpet")}>
                                Normal Carpet flooring
                                </Button>

                                <Button variant="outline" onClick={() => handleSelectFlooring("Carpet Tile")}>
                                Carpet Tile flooring
                                </Button>

                                <Button variant="outline" className="mt-2" onClick={() => setStep("main")}>
                                ← Back
                                </Button>
                                <select>
                                    <option value=""></option>
                                </select>
                            </div>
                            )}
                        </DialogContent>
                        </Dialog>


 {/* //////////////////////==========================================Flooring section   */}

 {activeMainSection === "flooring" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Flooring</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Room*</FormLabel>
                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="md:col-span-2 flex items-end gap-2">
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setBlindDialogState({ isOpen: true, roomName: selectedRoom });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
                        </Button>
                      </div>
                        <FormField
                        control={form.control}
                        name="newProduct.Type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Flooring Type</FormLabel>
                            <FormControl>
                              <Combobox
                              options={["Wooden Flooring","Carpet flooring"].map(floorType => ({value: floorType,label:floorType}))}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                              }}
                              placeholder="Select Flooring Type."
                            />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BCN*</FormLabel>
                            <Combobox
                              options={bcnOptions}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                                handleBcnSelect(value);
                              }}
                              onSearch={handleBcnSearch}
                              placeholder="Search by BCN..."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qty</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}


              {stagedItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Staged Items for Room: {form.getValues("room") || "Unassigned"}</h4>

                  <ul className="text-xs list-disc list-inside p-2 border rounded-md bg-muted/50">
                    {stagedItems.map((item, i) => (
                      <li key={i}>
                        {!("productType" in item) ? (
                          <span>
                            {item.collectionBrand} - Qty: {(item as any).quantity || "N/A"}
                          </span>
                        ) : null}

                        {item.productType === "Hardware" && (
                            <span>
                                <strong>{item.productCategory}</strong>
                                {" → "}{item.subCategory}

                                {item.quantity && (
                                    <span>{` (Qty: ${item.quantity})`}</span>
                                )}

                                {item.bcn && (
                                    <span>{` | BCN: ${item.bcn}`}</span>
                                )}
                            </span>
                        )}
                        {item.productSource === "flooring" && (
                        <span>
                            Flooring → <strong>{item.flooringType}</strong> — Qty: {item.quantity}
                        </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button type="button" onClick={handleAddProductsToList}>
                Add Products to List
              </Button>
            </div>

            <Separator className="my-8" />
          </form>
        </CardContent>
      </Card>
      {blindDialogState.isOpen && blindDialogState.roomName && (
        <AddBlindsDialog
          isOpen={blindDialogState.isOpen}
          onClose={() => setBlindDialogState({ isOpen: false, roomName: null })}
          roomName={blindDialogState.roomName}
          onSave={handleBlindsAdded}
        />
      )}
    </FormProvider>
  );
}
