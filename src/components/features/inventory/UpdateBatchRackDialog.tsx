
"use client";

import { useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Stock } from "@/lib/types";
import { searchStockByBcn, updateStockBatchAction } from "@/app/dashboard/inventory/actions";
import { Loader2, Trash2 } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const updateRackSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    bcn: z.string(),
    itemName: z.string(),
    rack: z.string().optional(),
  })).min(1, "Please add at least one item to update.")
});

type UpdateRackFormValues = z.infer<typeof updateRackSchema>;

interface UpdateBatchRackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateBatchRackDialog({ isOpen, onClose }: UpdateBatchRackDialogProps) {
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<UpdateRackFormValues>({
    resolver: zodResolver(updateRackSchema),
    defaultValues: {
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
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
        label: `${stock.bcn} - ${stock.name || stock.itemName || "Unnamed"}`,
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
      itemName: stockItem.name || stockItem.itemName || "",
      rack: stockItem.rack || "", // Default to existing or empty
    });
  };

  const onSubmit = async (data: UpdateRackFormValues) => {
    setIsSubmitting(true);
    try {
      const itemsToUpdate = data.items.map(item => ({
        id: item.id,
        rack: item.rack,
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
      console.error("Error updating racks:", error);
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
          <DialogTitle>Update Batch Rack</DialogTitle>
          <DialogDescription>Search for items by BCN to add them to the batch for rack updates.</DialogDescription>
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
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>BCN / Item Name</TableHead>
                      <TableHead>Rack</TableHead>
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
                              name={`items.${index}.rack`}
                              render={({ field }) => (
                                <FormControl>
                                  <Input placeholder="Enter rack no." {...field} />
                                </FormControl>
                              )}
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
                        <TableCell colSpan={4} className="h-24 text-center">
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
