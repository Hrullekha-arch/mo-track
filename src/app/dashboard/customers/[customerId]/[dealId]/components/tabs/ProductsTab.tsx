// app/deals/[dealId]/page.tsx
"use client";
import { useState, useCallback, lazy, Suspense } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DealProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2 } from "lucide-react";
import { useBcnSearch } from "../../hooks/useBcnSearch";
import { useStagedItems } from "../../hooks/useStagedItems";
import { VasForm } from "../../dialogs.tsx/Vasform";
import { ProductFormSection } from "../tabSubComponent/ProductFormSection";
import { StagedItemsList } from "../tabSubComponent/StagedItemsList";

const ScannerDialog = lazy(() => import("../../dialogs.tsx/ScannerDialog").then(m => ({ default: m.default })));
const HardwareDialog = lazy(() => import("../../dialogs.tsx/HardwareDialog").then(m => ({ default: m.default })));
const FlooringDialog = lazy(() => import("../../dialogs.tsx/FlooringDialog").then(m => ({ default: m.default })));

// ─── Schema ───────────────────────────────────────────────────────────────
const newProductSchema = z.object({
  Type: z.string().optional().default(""),
  collectionBrand: z.string().min(1, "BCN is required."), // Required field
  salesDescription: z.string().optional().default(""),
  mrp: z.string().optional().default(""),
  verticalRepeat: z.string().optional().default(""),
  horizontalRepeat: z.string().optional().default(""),
  quantity: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
  fabricCategoryGroup: z.string().optional().default(""),
});

const formSchema = z.object({
  room: z.string().optional(),
  newProduct: newProductSchema,
});

type FormValues = z.infer<typeof formSchema>;

type ProductsTabProps = {
  customerId: string;
  dealId: string;
  existingProducts?: DealProduct[];
  onProductsSaved?: () => void;
};

export default function ProductsTab({ customerId, dealId, existingProducts = [], onProductsSaved }: ProductsTabProps) {
  
  // ─── FIX: Explicit Default Values ───────────────────────────────────────
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      room: "",
      newProduct: {
        Type: "",
        collectionBrand: "", // Explicitly setting empty string
        salesDescription: "",
        mrp: "",
        verticalRepeat: "",
        horizontalRepeat: "",
        quantity: "",
        remarks: "",
      },
    },
  });

  // ─── State ──────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<"main" | "fabric" | "wallpaper" | "flooring">("main");
  const [fabricCategory, setFabricCategory] = useState("MAIN");
  const [flooringType, setFlooringType] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [flooringDialogOpen, setFlooringDialogOpen] = useState(false);
  const [hardwareDialogOpen, setHardwareDialogOpen] = useState(false);

  // ─── Hooks ──────────────────────────────────────────────────────────────
  const { bcnOptions, handleBcnSearch, handleBcnSelect, currentBcnimsQty, imsSearching } = useBcnSearch(form);
  const { stagedItems, loading, handleStageItem, handleAddProductsToList, setStagedItems } = useStagedItems(
    form, 
    activeSection, 
    fabricCategory, 
    flooringType
  );

  // ─── Dialog Handlers ───────────────────────────────────────────────────
  const handleSaveHardware = useCallback((payload: any) => {
    // Push to staged items via the hook
    setStagedItems((prev: any) => [...prev, payload]);
    setHardwareDialogOpen(false);
  }, [setStagedItems]);

  const handleSaveVas = useCallback((payload: any) => {
    setStagedItems((prev: any) => [
      ...prev, 
      { ...payload, id: `vas-${Date.now()}`, productType: "VAS" }
    ]);
  }, [setStagedItems]);

  return (
    <FormProvider {...form}>
      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">Products</h2>
              <p className="text-sm text-muted-foreground">Add items and stage them for this deal.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="mr-2 h-4 w-4" /> Scan QR
            </Button>
          </div>
          
          <Separator className="my-4" />

          <div className="space-y-6">
            {/* MAIN MENU */}
            {activeSection === "main" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 border rounded-xl space-y-3">
                  <Button type="button" className="w-full" variant="outline" onClick={() => setActiveSection("fabric")}>Furnishing Fabric</Button>
                  <Button type="button" className="w-full" variant="outline" onClick={() => setActiveSection("wallpaper")}>Wallpaper</Button>
                  <Button type="button" className="w-full" variant="outline" onClick={() => setFlooringDialogOpen(true)}>Flooring</Button>
                </div>
                <div className="p-4 border rounded-xl space-y-3">
                  <Button type="button" className="w-full" variant="outline" onClick={() => setHardwareDialogOpen(true)}>Hardware</Button>
                  <VasForm form={form} onSaveVas={handleSaveVas} />
                </div>
              </div>
            )}

            {/* DYNAMIC FORM SECTION */}
            {activeSection !== "main" && (
              <ProductFormSection
                section={activeSection}
                form={form}
                bcnOptions={bcnOptions}
                onBcnSearch={handleBcnSearch}
                onBcnSelect={handleBcnSelect}
                imsSearching={imsSearching}
                currentBcnimsQty={currentBcnimsQty}
                fabricCategoryGroup={fabricCategory}
                setFabricCategoryGroup={setFabricCategory}
                selectedFlooringType={flooringType}
                setSelectedFlooringType={setFlooringType}
                onStageItem={handleStageItem}
                onBack={() => setActiveSection("main")}
              />
            )}

            {/* STAGED ITEMS LIST */}
            <StagedItemsList stagedItems={stagedItems} room={form.watch("room")} />

            {/* SUBMIT BUTTON */}
            <Button 
              type="button" 
              onClick={() => handleAddProductsToList(customerId, dealId, existingProducts, onProductsSaved)} 
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Products to List
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* LAZY LOADED DIALOGS */}
      <Suspense fallback={<div className="fixed inset-0 bg-white/80 flex items-center justify-center">Loading...</div>}>
        {scanOpen && (
          <ScannerDialog 
            open={scanOpen} 
            onOpenChange={setScanOpen} 
            onStageItem={(stock: any, id: any) => {
              setStagedItems((prev: any) => [...prev, { 
                collectionBrand: stock?.bcn || id, 
                salesDescription: stock?.itemName, 
                mrp: stock?.rrpWithGstRs, 
                quantity: "", 
                verticalRepeat: stock?.verticalRepeatCms, 
                horizontalRepeat: stock?.horizontalRepeatCms, 
                productSource: stock?.type?.toLowerCase().includes("wall") ? "wallpaper" : "fabric" 
              }]);
            }} 
          />
        )}

        {flooringDialogOpen && (
          <FlooringDialog 
            open={flooringDialogOpen} 
            onOpenChange={setFlooringDialogOpen} 
            onSelectFlooring={(t) => { 
              setFlooringType(t); 
              setActiveSection("flooring"); 
              setFlooringDialogOpen(false); 
            }} 
          />
        )}

        {hardwareDialogOpen && (
          <HardwareDialog 
            open={hardwareDialogOpen} 
            onOpenChange={setHardwareDialogOpen} 
            onSaveHardware={handleSaveHardware} 
            form={form} 
          />
        )}
      </Suspense>
    </FormProvider>
  );
}