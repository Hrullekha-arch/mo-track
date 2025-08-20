
"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { TaxDetail } from "@/lib/types";

const taxDetailSchema = z.object({
  hsnCode: z.string().min(1, "HSN Code is required."),
  gst: z.preprocess((val) => Number(String(val).replace('%', '')), z.number().min(0)),
  cgst: z.preprocess((val) => Number(String(val).replace('%', '')), z.number().min(0)),
  sgst: z.preprocess((val) => Number(String(val).replace('%', '')), z.number().min(0)),
  igst: z.preprocess((val) => Number(String(val).replace('%', '')), z.number().min(0)),
});

type TaxDetailFormValues = z.infer<typeof taxDetailSchema>;

export function TaxDetails() {
  const [taxDetails, setTaxDetails] = useState<TaxDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<TaxDetailFormValues>({
    resolver: zodResolver(taxDetailSchema),
    defaultValues: { hsnCode: "", gst: 0, cgst: 0, sgst: 0, igst: 0 },
  });

  useEffect(() => {
    const q = query(collection(db, "taxDetails"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxDetail));
      setTaxDetails(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const onSubmit = async (data: TaxDetailFormValues) => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "taxDetails"), data);
      toast({ title: "Tax Detail Added" });
      form.reset();
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Could not add tax detail." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "taxDetails", id));
      toast({ title: "Tax Detail Deleted" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Could not delete tax detail." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Details</CardTitle>
        <CardDescription>Manage HSN-based tax rates for your products.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-2 mb-4 p-4 border rounded-lg">
          <div className="grid grid-cols-5 gap-4 flex-grow">
            <Input placeholder="HSN Code" {...form.register("hsnCode")} />
            <Input placeholder="GST%" {...form.register("gst")} />
            <Input placeholder="CGST%" {...form.register("cgst")} />
            <Input placeholder="SGST%" {...form.register("sgst")} />
            <Input placeholder="IGST%" {...form.register("igst")} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
          </Button>
        </form>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>HSN Code</TableHead>
                <TableHead>GST%</TableHead>
                <TableHead>CGST%</TableHead>
                <TableHead>SGST%</TableHead>
                <TableHead>IGST%</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : taxDetails.length > 0 ? (
                taxDetails.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.hsnCode}</TableCell>
                    <TableCell>{item.gst.toFixed(2)}%</TableCell>
                    <TableCell>{item.cgst.toFixed(2)}%</TableCell>
                    <TableCell>{item.sgst.toFixed(2)}%</TableCell>
                    <TableCell>{item.igst.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No tax details found. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
