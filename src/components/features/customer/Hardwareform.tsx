
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
  const categories = [
    { id: 1, name: "Rod" },
    { id: 2, name: "Accessories" },
    { id: 3, name: "Pelmet" },
  ];

  const hardwareMain = [
    { id: 1, name: "Rod" },
    { id: 2, name: "Curtain Track" },
    { id: 3, name: "Roman Blind Track" },

  ];

  const rodSubOptions = [
    { id: 1, name: "Rod" },
    { id: 2, name: "Bracket" },
    { id: 3, name: "Final" },
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
  { id: 1, name: "Wodden" },
  { id: 2, name: "Quilted" },
  { id: 3, name: "Blind Pelmet" },

];

  const [open, setOpen] = useState(false);
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [step, setStep] = useState("main"); // "main", "rod"
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
  setImage(null);     // IMPORTANT
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
  // ⭐ Get form values
  const values = form.getValues();

  const room = values.room || null;

  // ⭐ Auto-detect main category
  let mainCategory = "Hardware";

  if (step.includes("accessories")) mainCategory = "Accessories";
  else if (step.includes("pelmet")) mainCategory = "Pelmet";
  else if (step.includes("roman")) mainCategory = "Roman Track";
  else if (step.includes("track")) mainCategory = "Track";

  // ⭐ Auto build full category path
  const subCategory = [selectedItem, finalItem].filter(Boolean).join(" → ");

  // ⭐ Build final payload
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

  // ⭐ FINALLY send to ProductForm
  onSaveHardware(payload);

  // ⭐ Clear fields
  resetItemFields();
  setOpen(false);
};





  const handleCategoryClick = (category) => {
    if (category === "Hardware") {
      setDialogTitle("Hardware Options");
      setStep("subtop");
      setOpen(true);
    }
    if (category === "Rod") {
      setDialogTitle("Rod Options");
      setStep("main");
      setOpen(true);
    }
    if (category === "Accessories") {
      setDialogTitle("Accessories");
      setStep("accessories");
      setUploadImageAllowed(true); // new step
      setOpen(true);
    }
    if (category === "Pelmet") {
      setDialogTitle("Pelmet");
      setUploadImageAllowed(true);
      setStep("pelmet");   // new step
      setOpen(true);
    }
  };

  const handleHardwareClick = (optionName) => {
    if (optionName === "Rod") {
      setDialogTitle("Rod Options");
      setStep("rod");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onloadend = () => {
    setImage(reader.result as string);  // Store base64 string in state
  };
  reader.readAsDataURL(file);
};


  return (
    <>
      {/* ------------ TOP LEVEL BUTTONS ------------ */}
      <div className="">
        <div className=" rounded-xl flex flex-col gap-3">
          {mainCategories.map((cat) => (
            <Button
              key={cat.id}
              variant="outline"
              type="button"
              className=""
              onClick={() => handleCategoryClick(cat.name)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* ------------ DIALOG ------------ */}
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
                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
          </DialogHeader>
          {/* ///////////////sub Top Level//////////////// */}
                    {step === "subtop" && (
            <div className="grid gap-3 py-4">
              {[{ id: 1, name: "Rod" },
                { id: 2, name: "Pelmet" },].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                                    if (opt.name === "Rod") {
                                      setStep("main");          // ← new step
                                      setDialogTitle("Type");
                                    } else {
                                      // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      setFinalItem(opt.name);
                                      setStep("pelmet");
                                      setUploadImageAllowed(true);
                                      setDialogTitle(`${opt.name} Details`);
                                    }
                                  }}
                >
                  {opt.name}
                </Button>

                
                
              ))}
            </div>
          )}

 {/*////////////////////////////////////////////// ============MAIN HARDWARE OPTIONS ===================////////////////////////////*/}
          {step === "main" && (
            <div className="grid gap-3 py-4">
              {hardwareMain.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                                    if (opt.name === "Curtain Track") {
                                      setStep("curtaintrack");          // ← new step
                                      setDialogTitle("Curtain Track Type");
                                    }else if (opt.name === "Roman Blind Track"){
                                      setStep("romantrack");          // ← new step
                                      setDialogTitle("Roman Blind Track Type");
                                    } else {
                                      // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      setFinalItem(opt.name);
                                      setStep("rod");
                                      setUploadImageAllowed(true);
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
                  setStep("subtop");
                  setDialogTitle("Hardware Options");
                }}
              >
                ← Back
              </Button>
            </div>
          )}
{/* ////////////////////////////////=================================== Hardware menu Details of ROD ==================================================////////////////////////////// */}
          {/* ==========================================ROD SUB OPTIONS */}
          {step === "rod" && (
            <div className="grid gap-3 py-4">
              {rodSubOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                                    if (opt.name === "Bracket") {
                                      setStep("bracket");          // ← new step
                                      setDialogTitle("Bracket Type");
                                    }else if (opt.name === "Final"){
                                      setStep("Final");          // ← new step
                                      setDialogTitle("Final Item Details");
                                    } else {
                                      // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      setFinalItem(opt.name);
                                      setStep("item");
                                      setDialogTitle(`${opt.name} Details`);
                                    }
                                  }}>
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

          {/* //===================================Rod Menu========================== */}
          {step === "item" && (
          <div className="grid gap-4 py-4">

            {/* Combo Box Search */}
            <Label>Search BCN</Label>
            <Combobox
              options={bcnOptions}    // You will pass your options here
              value={selectedItemValue}   // create this state
              onSelect={(value) => { 
                setSelectedItemValue(value); 
                setFinalItem(value);
                handleBcnSelect(value);   // optional
              }}
              onSearch={handleBcnSearch}  // optional
              placeholder="Search item..."
            />


            {/* Rate Field */}
            <Label>Rate</Label>
            <Input 
            placeholder="Enter rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />


            {/* Quantity Field */}
            <Label>Quantity</Label>
            <Input 
              placeholder="Enter quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />

            {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}


            {/* Buttons */}
            <div className="flex justify-between mt-4">
              <Button
                variant="outline"
                onClick={() => setStep("rod")}
              >
                ← Back
              </Button>

              <Button onClick={handleFinalSave}>Save</Button>

            </div>

          </div>
        )}

        {/* //================Bracket Sub Menu //================== */}
        {step === "bracket" && (
        <div className="grid gap-3 py-4">
          {bracketOptions.map((opt) => (
            <Button
              key={opt.id}
              variant="outline"
              className="w-full py-4 rounded-xl"
              onClick={() => {
                setSelectedBracketType(opt.name);     // Single / Double / Corner
                setStep("bracketItem");               // go to new screen
                setDialogTitle(`${opt.name} Bracket`);
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

       {/* //==================== Bracket Item Details ================== */}
          {step === "bracketItem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Bracket</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search bracket..."
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("bracket")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}
                 {/* //==================== Final Item Details ================== */}
          {step === "Final" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search bracket..."
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("rod")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}
{/* ///////////////////////////////////////////////////////////=================================== Hardware Details of Track==================================================////////////////////////////// */}
                  {/* //================Curtain Track Sub Menu //================== */}
                    {step === "curtaintrack" && (
                    <div className="grid gap-3 py-4">
                      {TrackOptions.map((opt) => (
                        <Button
                          key={opt.id}
                          variant="outline"
                          className="w-full py-4 rounded-xl"
                          onClick={() => {
                                    if (opt.name === "Motorized") {
                                      setStep("motorized track");          // ← new step
                                      setDialogTitle("Motorized Options");
                                    } else {
                                      // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      setFinalItem(opt.name);
                                      setStep("manualtrackitem");
                                      setUploadImageAllowed(true);
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

                  {/* //================Motorized Track Sub Menu //================== */}
                    {step === "motorized track" && (
                    <div className="grid gap-3 py-4">
                      {[{ id: 1, name: "Motor" },
                        { id: 2, name: "Motorized track" },
                        { id: 3, name: "Remote" },].map((opt) => (
                        <Button
                          key={opt.id}
                          variant="outline"
                          className="w-full py-4 rounded-xl"
                          onClick={() => {
                            setSelectedBracketType(opt.name);     // Single / Double / Corner
                            setStep("motorizedtrackitem");               // go to new screen
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

 {/* //==================== Manual Track Item Details ================== */}
          {step === "manualtrackitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("curtaintrack")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}

{/* //==================== Motorized track Item Details ================== */}
          {step === "motorizedtrackitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("motorized track")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}
 {/* ///////////////////////////////////////////////////////////=================================== Hardware Details of RomanTrack==================================================////////////////////////////// */}
                  {/* //================Roman Track Sub Menu //================== */}
                    {step === "romantrack" && (
                    <div className="grid gap-3 py-4">
                      {TrackOptions.map((opt) => (
                        <Button
                          key={opt.id}
                          variant="outline"
                          className="w-full py-4 rounded-xl"
                          onClick={() => {
                                    if (opt.name === "Motorized") {
                                      setStep("motorized roman track");          // ← new step
                                      setDialogTitle("Motorized Options");
                                    } else {
                                      // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      
                                      setStep("manual roman track");
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

                  {/* //================Motorized roman Track Sub Menu //================== */}
                    {step === "motorized roman track" && (
                    <div className="grid gap-3 py-4">
                      {[{ id: 1, name: "Motorized track" },
                        { id: 2, name: "Remote" },].map((opt) => (
                        <Button
                          key={opt.id}
                          variant="outline"
                          className="w-full py-4 rounded-xl"
                          onClick={() => {
                            setSelectedBracketType(opt.name);     // Single / Double / Corner
                            setStep("motorizedromantrackitem");               // go to new screen
                            setDialogTitle(`${opt.name} Details`);
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
                          setDialogTitle("romantrack");
                        }}
                      >
                        ← Back
                      </Button>
                    </div>
                  )} 

                  {/* //================manual Roman Track Sub Menu //================== */}
                    {step === "manual roman track" && (
                    <div className="grid gap-3 py-4">
                      {[{ id: 1, name: "Normal Roman Track" },
                        { id: 2, name: "Heavy Roman Track" },].map((opt) => (
                        <Button
                          key={opt.id}
                          variant="outline"
                          className="w-full py-4 rounded-xl"
                          onClick={() => {
                            setSelectedBracketType(opt.name);     // Single / Double / Corner
                            setStep("manualromantrackitem");               // go to new screen
                            setDialogTitle(`${opt.name} Details`);
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
                          setDialogTitle("Roman Track Type");
                        }}
                      >
                        ← Back
                      </Button>
                    </div>
                  )}

 {/* //==================== Manual Track Item Details ================== */}
          {step === "manualromantrackitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("manual roman track")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}

{/* //==================== Motorized track Item Details ================== */}
          {step === "motorizedromantrackitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("motorized roman track")}
                >
                  ← Back
                </Button>

               <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}
{/* /////////=======================================================================hardware Details End Here=================================================//////////////////////////////  */}
{/* //////////============================================================Accessories Options Start Here=================================================//////////////////////////////  */}
         {step === "accessories" && (
            <div className="grid gap-3 py-4">
              {AccessoriesOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                                     // existing logic for Rod / Final
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

 {/* //==================== Accessories Item Details ================== */}
          {step === "accessoriesitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("accessories")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}

 {/* /////////////////////////////===================================accessoriesitem Details End Here==================================================////////////////////////////// */}
{/* ////////////======================Pelemet start here============================////////////////////////////// */}
            {step === "pelmet" && (
            <div className="grid gap-3 py-4">
              {PelmetOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                                     // existing logic for Rod / Final
                                      setSelectedItem(opt.name);
                                      setFinalItem(opt.name);
                                      setStep("pelmetitem");
                                      setDialogTitle(`${opt.name} Details`);
                                    
                                  }}
                >
                  {opt.name}
                </Button>
              ))}
            </div>
          )}

 {/* //==================== pelemet Item Details ================== */}
          {step === "pelmetitem" && (
            <div className="grid gap-4 py-4">

              {/* Label + Dropdown */}
              <div>
                <Label>Select Final</Label>
                <Input
                  // options={bracketItemsOptions}   // <- create this array
                  // value={selectedItemValue}
                  // onSelect={(value) => {
                  //   setSelectedItemValue(value);
                  //   handleHardwareItemSelect(value);   // <-- auto-fill MRP here
                  // }}
                  placeholder="Search Item"
                />
              </div>

              {/* MRP */}
              <div>
                <Label>MRP</Label>
                <Input
                  placeholder="Enter rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {/* image Only show when necessary */}
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
                    />
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("pelmet")}
                >
                  ← Back
                </Button>

                <Button onClick={handleFinalSave}>Save</Button>

              </div>
            </div>
          )}
{/* ///////////////======================Pelemet End here============================//////////////////////////////  */}
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
