
"use client";

import { useState, useCallback, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Stock } from "@/lib/types";
import { searchStockByBcn, updateStockBatchAction } from "@/app/dashboard/inventory/actions";
import { Loader2, PlusCircle, Trash2, Upload } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";

const updateTaxSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    bcn: z.string(),
    itemName: z.string(),
    hsnCode: z.string().optional(),
    mrp: z.string().optional(),
    tax: z.string().optional(),
    vendorName: z.string().optional(),
  })).min(1, "Please add at least one item to update.")
});

type UpdateTaxFormValues = z.infer<typeof updateTaxSchema>;

interface UpdateBatchTaxDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateBatchTaxDialog({ isOpen, onClose }: UpdateBatchTaxDialogProps) {
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<UpdateTaxFormValues>({
    resolver: zodResolver(updateTaxSchema),
    defaultValues: {
      items: [],
    },
  });

  const { getValues, setValue, control } = form;

  const { fields, append, remove } = useFieldArray({
    control: control,
    name: "items",
  });

  const handleBcnSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchStockByBcn(query);
      const options = results.map(stock => ({
        value: stock.id,
        label: `${stock.bcn} - ${stock.itemName}`,
        stockItem: stock
      }));
      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      toast({ variant: 'destructive', title: 'Search failed' });
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  const handleSelectStock = (stockItem: Stock) => {
    const isAlreadyAdded = fields.some(field => field.id === stockItem.id);
    if (isAlreadyAdded) {
      toast({ variant: "destructive", title: "Item already added" });
      return;
    }
    append({
      id: stockItem.id,
      bcn: stockItem.bcn || '',
      itemName: stockItem.itemName,
      hsnCode: stockItem.hsnCode,
      mrp: String(stockItem.mrp || ''),
      tax: String(stockItem.tax || ''), // Use existing tax value or empty
      vendorName: stockItem.vendorName,
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];

        if (json.length < 1) {
          toast({ variant: "destructive", title: "Empty File", description: "The selected Excel file is empty." });
          return;
        }

        const taxMap = new Map<string, string>();
        json.forEach(row => {
          const hsn = String(row[0] || '').trim();
          const tax = String(row[1] || '').trim();
          if (hsn && tax) {
            taxMap.set(hsn, tax.replace('%', ''));
          }
        });
        
        let updatedCount = 0;
        // Correctly get the current values from the form state
        const currentItems = getValues('items');
        currentItems.forEach((field, index) => {
            const hsnCode = field.hsnCode; // Use the current form value
            if (hsnCode && taxMap.has(hsnCode)) {
                setValue(`items.${index}.tax`, taxMap.get(hsnCode), { shouldDirty: true });
                updatedCount++;
            }
        });
        
        toast({ title: "Import Complete", description: `${updatedCount} item(s) had their tax rate updated.` });

      } catch (error) {
        console.error("Error processing Excel file:", error);
        toast({ variant: "destructive", title: "Import Failed", description: "Could not process the selected file." });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onSubmit = async (data: UpdateTaxFormValues) => {
    setIsSubmitting(true);
    try {
        const itemsToUpdate = data.items.map(item => ({
            id: item.id,
            hsnCode: item.hsnCode,
            vendorName: item.vendorName,
            mrp: item.mrp ? parseFloat(item.mrp) : undefined,
            tax: item.tax ? parseFloat(item.tax) : undefined,
        }));
        
        const result = await updateStockBatchAction(itemsToUpdate);

        if (result.success) {
            toast({ title: "Success", description: `${data.items.length} items have been updated.` });
            onClose();
            form.reset();
        } else {
            toast({ variant: "destructive", title: "Update Failed", description: result.message });
        }
    } catch (error) {
      console.error("Error submitting batch tax update:", error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected server error occurred." });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          form.reset();
          onClose();
        }
      }}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Update Batch Tax</DialogTitle>
          <DialogDescription>Search for items by BCN to add them to the batch for tax updates.</DialogDescription>
        </DialogHeader>
        <div className="py-4 flex-grow overflow-y-auto pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-end gap-2">
                <div className="w-full max-w-sm space-y-2">
                  <FormLabel>Bcn</FormLabel>
                  <Combobox
                    options={bcnOptions}
                    onSelect={(value) => {
                      const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
                      if (selectedOption) {
                        handleSelectStock(selectedOption.stockItem);
                      }
                    }}
                    placeholder="Search by BCN or Item Name..."
                    searchPlaceholder="Type to search..."
                    emptyPlaceholder={isSearching ? "Searching..." : "No stock found."}
                    onSearch={handleBcnSearch}
                  />
                </div>
                 <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Import Tax
                </Button>
                 <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".xlsx, .xls"
                />
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>BCN / Item Name</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead>MRP</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Vendor Name</TableHead>
                      <TableHead className="w-12">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.length > 0 ? fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <p className="font-semibold">{field.bcn}</p>
                          <p className="text-xs text-muted-foreground">{field.itemName}</p>
                        </TableCell>
                        <TableCell>
                           <FormField
                              control={form.control}
                              name={`items.${index}.hsnCode`}
                              render={({ field }) => ( <FormControl><Input placeholder="HSN" {...field} /></FormControl>)}
                            />
                        </TableCell>
                        <TableCell>
                           <FormField
                              control={form.control}
                              name={`items.${index}.mrp`}
                              render={({ field }) => ( <FormControl><Input type="number" placeholder="MRP" {...field} /></FormControl>)}
                            />
                        </TableCell>
                        <TableCell>
                           <FormField
                              control={form.control}
                              name={`items.${index}.tax`}
                              render={({ field }) => (
                                <FormControl>
                                  <Input placeholder="Enter tax %" {...field} />
                                </FormControl>
                              )}
                            />
                        </TableCell>
                         <TableCell>
                           <FormField
                              control={form.control}
                              name={`items.${index}.vendorName`}
                              render={({ field }) => ( <FormControl><Input placeholder="Vendor" {...field} /></FormControl>)}
                            />
                        </TableCell>
                        <TableCell>
                          <Button variant="destructive" size="icon" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          Selected bcn will be appear here
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

               <DialogFooter className="sticky bottom-0 bg-background/95 pt-4">
                 <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                 <Button type="submit" disabled={isSubmitting || fields.length === 0}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update
                 </Button>
               </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
