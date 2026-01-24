"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { Toast } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { roomOptions } from "@/lib/constants";

export default function HardwareTopLevel({ onSaveHardware, form }) {
  const {control} = form;
  
  const mainCategories = [    
    { id: 1, name: "Hardware" },
    { id: 2, name: "Accessories" },
  ];

  const hardwareMain = [
    { id: 1, name: "Rod" },
    { id: 2, name: "Curtain Track" },
    { id: 3, name: "Roman Blind Track" },
  ];

  const rodSubOptions = [
    { id: 1, name: "Rod" },
    { id: 2, name: "Bracket" },
    { id: 3, name: "Finial" }, // ✅ Fixed: "Final" → "Finial"
    { id: 4, name: "Ring" },
  ];

  const bracketOptions = [
    { id: 1, name: "Single" },
    { id: 2, name: "Double" },
    { id: 3, name: "Corner" },
  ];

  const TrackOptions = [
    { id: 1, name: "Manual" },
    { id: 2, name: "Motorized" },
  ];

  const AccessoriesOptions = [
    { id: 1, name: "Fibre Sticks" },
    { id: 2, name: "Tassel" },
    { id: 3, name: "Knobs" },
  ];

  const PelmetOptions = [
    { id: 1, name: "Wooden" }, // ✅ Fixed: "Wodden" → "Wooden"
    { id: 2, name: "Quilted" },
    { id: 3, name: "Blind Pelmet" },
  ];

  const [open, setOpen] = useState(false);
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [step, setStep] = useState("main");
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItemValue, setSelectedItemValue] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadImageAllowed, setUploadImageAllowed] = useState(false);
  const [finalItem, setFinalItem] = useState("");
  const [selectedBracketType, setSelectedBracketType] = useState("");

  const resetItemFields = () => {
    setRate("");
    setQuantity("");
    setSelectedItemValue("");
    setImage(null);
  };

  const handleBcnSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchStockByBcn(query);
      const options = results.map(stock => ({
        value: stock.bcn || stock.id,
        label: `${stock.bcn}`,
        stockItem: stock
      }));
      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      Toast({ variant: 'destructive', title: 'Search failed' });
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
    if (selectedOption) {
      const stockItem = selectedOption.stockItem;
      setRate(stockItem?.mrp ? stockItem.mrp.toString() : "");
    }
  };

  const handleFinalSave = () => {
    const values = form.getValues();
    const room = values.room || null;

    let mainCategory = "Hardware";
    if (step.includes("accessories")) mainCategory = "Accessories";
    else if (step.includes("pelmet")) mainCategory = "Pelmet";
    else if (step.includes("roman")) mainCategory = "Roman Track";
    else if (step.includes("track")) mainCategory = "Track";

    const subCategory = [selectedItem, finalItem].filter(Boolean).join(" → ");

    const payload = {
      productType: "Hardware",
      productCategory: mainCategory,
      subCategory,
      bcn: selectedItemValue || null,
      rate: rate || "",
      quantity: quantity || "",
      room,
      image,
      timestamp: Date.now(),
    };

    if (typeof onSaveHardware !== "function") {
      console.error("❌ onSaveHardware not passed to HardwareTopLevel!");
      return;
    }

    onSaveHardware(payload);
    resetItemFields();
    setOpen(false);
  };

  const handleCategoryClick = (category) => {
    if (category === "Hardware") {
      setDialogTitle("Hardware Options");
      setStep("subtop");
      setOpen(true);
    }
    if (category === "Accessories") {
      setDialogTitle("Accessories");
      setStep("accessories");
      setUploadImageAllowed(true);
      setOpen(true);
    }
    if (category === "Pelmet") {
      setDialogTitle("Pelmet");
      setUploadImageAllowed(true);
      setStep("pelmet");
      setOpen(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      {/* TOP LEVEL BUTTONS */}
      <div className="">
        <div className="rounded-xl flex flex-col gap-3">
          {mainCategories.map((cat) => (
            <Button
              key={cat.id}
              variant="outline"
              type="button"
              onClick={() => handleCategoryClick(cat.name)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <FormField
              control={form.control}
              name="room"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room*</FormLabel>
                  <Combobox 
                    options={roomOptions} 
                    value={field.value} 
                    onSelect={field.onChange} 
                    placeholder="Select Room..." 
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </DialogHeader>

          {/* SUB TOP LEVEL */}
          {step === "subtop" && (
            <div className="grid gap-3 py-4">
              {[{ id: 1, name: "Rod" }, { id: 2, name: "Pelmet" }].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    if (opt.name === "Rod") {
                      setStep("main");
                      setDialogTitle("Hardware Type");
                    } else {
                      setSelectedItem(opt.name);
                      setFinalItem(opt.name);
                      setStep("pelmet");
                      setUploadImageAllowed(true);
                      setDialogTitle(`${opt.name} Options`);
                    }
                  }}
                >
                  {opt.name}
                </Button>
              ))}
            </div>
          )}

          {/* MAIN HARDWARE OPTIONS */}
          {step === "main" && (
            <div className="grid gap-3 py-4">
              {hardwareMain.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    if (opt.name === "Curtain Track") {
                      setStep("curtaintrack");
                      setDialogTitle("Curtain Track Type");
                    } else if (opt.name === "Roman Blind Track") {
                      setStep("romantrack");
                      setDialogTitle("Roman Blind Track Type");
                    } else {
                      setSelectedItem(opt.name);
                      setFinalItem(opt.name);
                      setStep("rod");
                      setUploadImageAllowed(true);
                      setDialogTitle(`${opt.name} Options`);
                    }
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("subtop");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* ROD SUB OPTIONS */}
          {step === "rod" && (
            <div className="grid gap-3 py-4">
              {rodSubOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    if (opt.name === "Bracket") {
                      setStep("bracket");
                      setDialogTitle("Bracket Type");
                    } else if (opt.name === "Finial") { // ✅ Fixed
                      setStep("finial"); // ✅ Fixed
                      setDialogTitle("Finial Details");
                    } else {
                      setSelectedItem(opt.name);
                      setFinalItem(opt.name);
                      setStep("item");
                      setDialogTitle(`${opt.name} Details`);
                    }
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("main");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* ROD/RING ITEM DETAILS */}
          {step === "item" && (
            <div className="grid gap-4 py-4">
              <Label>Search BCN</Label>
              <Combobox
                options={bcnOptions}
                value={selectedItemValue}
                onSelect={(value) => { 
                  setSelectedItemValue(value); 
                  setFinalItem(value);
                  handleBcnSelect(value);
                }}
                onSearch={handleBcnSearch}
                placeholder="Search item..."
              />

              <Label>Rate</Label>
              <Input 
                placeholder="Enter rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />

              <Label>Quantity</Label>
              <Input 
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("rod")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* BRACKET SUB MENU */}
          {step === "bracket" && (
            <div className="grid gap-3 py-4">
              {bracketOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedBracketType(opt.name);
                    setStep("bracketItem");
                    setDialogTitle(`${opt.name} Bracket Details`);
                    setFinalItem(`${opt.name} Bracket`); // ✅ Added context
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("rod");
                  setDialogTitle("Rod Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* BRACKET ITEM DETAILS */}
          {step === "bracketItem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Bracket Item</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search bracket..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("bracket")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* FINIAL ITEM DETAILS */}
          {step === "finial" && ( // ✅ Fixed step name
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Finial</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    setFinalItem(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search finial..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("rod")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* CURTAIN TRACK SUB MENU */}
          {step === "curtaintrack" && (
            <div className="grid gap-3 py-4">
              {TrackOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    if (opt.name === "Motorized") {
                      setStep("motorized track");
                      setDialogTitle("Motorized Track Options");
                    } else {
                      setSelectedItem(opt.name);
                      setFinalItem(`${opt.name} Curtain Track`);
                      setStep("manualtrackitem");
                      setUploadImageAllowed(true);
                      setDialogTitle(`${opt.name} Track Details`);
                    }
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("main");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* MOTORIZED TRACK SUB MENU */}
          {step === "motorized track" && (
            <div className="grid gap-3 py-4">
              {[
                { id: 1, name: "Motor" },
                { id: 2, name: "Motorized Track" },
                { id: 3, name: "Remote" },
              ].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setStep("motorizedtrackitem");
                    setDialogTitle(`${opt.name} Details`);
                    setFinalItem(opt.name);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("curtaintrack");
                  setDialogTitle("Curtain Track Type");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* MANUAL TRACK ITEM DETAILS */}
          {step === "manualtrackitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Track</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search track..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("curtaintrack")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* MOTORIZED TRACK ITEM DETAILS */}
          {step === "motorizedtrackitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Item</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search item..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("motorized track")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* ROMAN TRACK SUB MENU */}
          {step === "romantrack" && (
            <div className="grid gap-3 py-4">
              {TrackOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    if (opt.name === "Motorized") {
                      setStep("motorized roman track");
                      setDialogTitle("Motorized Roman Track Options");
                    } else {
                      setSelectedItem(opt.name);
                      setStep("manual roman track");
                      setDialogTitle(`${opt.name} Roman Track`);
                    }
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("main");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* MOTORIZED ROMAN TRACK SUB MENU */}
          {step === "motorized roman track" && (
            <div className="grid gap-3 py-4">
              {[
                { id: 1, name: "Motorized Roman Track" },
                { id: 2, name: "Remote" },
              ].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setStep("motorizedromantrackitem");
                    setDialogTitle(`${opt.name} Details`);
                    setFinalItem(opt.name);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("romantrack");
                  setDialogTitle("Roman Blind Track Type");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* MANUAL ROMAN TRACK SUB MENU */}
          {step === "manual roman track" && (
            <div className="grid gap-3 py-4">
              {[
                { id: 1, name: "Normal Roman Track" },
                { id: 2, name: "Heavy Roman Track" },
              ].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setStep("manualromantrackitem");
                    setDialogTitle(`${opt.name} Details`);
                    setFinalItem(opt.name);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("romantrack");
                  setDialogTitle("Roman Blind Track Type");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* MANUAL ROMAN TRACK ITEM DETAILS */}
          {step === "manualromantrackitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Roman Track</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search roman track..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("manual roman track")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* MOTORIZED ROMAN TRACK ITEM DETAILS */}
          {step === "motorizedromantrackitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Item</Label> {/* ✅ Fixed label */}
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search item..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("motorized roman track")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

                    {/* ACCESSORIES OPTIONS */}
          {step === "accessories" && (
            <div className="grid gap-3 py-4">
              {AccessoriesOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setFinalItem(opt.name);
                    setStep("accessoriesitem");
                    setDialogTitle(`${opt.name} Details`);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
            </div>
          )}

          {/* ACCESSORIES ITEM DETAILS */}
          {step === "accessoriesitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Accessory</Label>
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search accessory..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("accessories")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          {/* PELMET OPTIONS */}
          {step === "pelmet" && (
            <div className="grid gap-3 py-4">
              {PelmetOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setFinalItem(opt.name);
                    setStep("pelmetitem");
                    setDialogTitle(`${opt.name} Pelmet Details`);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("subtop");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {/* PELMET ITEM DETAILS */}
          {step === "pelmetitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Select Pelmet</Label>
                <Combobox
                  options={bcnOptions}
                  value={selectedItemValue}
                  onSelect={(value) => {
                    setSelectedItemValue(value);
                    handleBcnSelect(value);
                  }}
                  onSearch={handleBcnSearch}
                  placeholder="Search pelmet..."
                />
              </div>

              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                      alt="Preview"
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep("pelmet")}>
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
