
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, Upload, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { TaxDetail } from "@/lib/types";
import * as XLSX from "xlsx";

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
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const filteredTaxDetails = useMemo(() => {
    if (!searchTerm) {
      return taxDetails;
    }
    return taxDetails.filter(detail =>
      detail.hsnCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [taxDetails, searchTerm]);

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
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length < 2) {
                toast({ variant: "destructive", title: "Empty File", description: "The Excel file has no data rows." });
                return;
            }

            const taxDetailsToImport: Omit<TaxDetail, 'id'>[] = json.slice(1).map(row => {
                const hsn = String((row as any)[0] || '').trim();
                const gst = parseFloat(String((row as any)[1] || '0').replace('%', ''));

                if (!hsn || isNaN(gst)) {
                    return null;
                }
                
                return {
                    hsnCode: hsn,
                    gst: gst,
                    cgst: gst / 2,
                    sgst: gst / 2,
                    igst: 0,
                };
            }).filter((item): item is Omit<TaxDetail, 'id'> => item !== null);
            
            if (taxDetailsToImport.length === 0) {
                toast({ variant: "destructive", title: "Invalid Format", description: "No valid HSN/Tax data found. Ensure HSN is in column A and Tax % is in column B." });
                return;
            }

            const batch = writeBatch(db);
            const taxDetailsCollection = collection(db, "taxDetails");
            taxDetailsToImport.forEach(taxDetail => {
                const docRef = doc(taxDetailsCollection);
                batch.set(docRef, taxDetail);
            });

            await batch.commit();

            toast({ title: "Import Successful", description: `${taxDetailsToImport.length} tax details have been added.` });

        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Import Failed", description: "Could not process the Excel file." });
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Details</CardTitle>
        <CardDescription>Manage HSN-based tax rates for your products.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-4">
             <Button onClick={() => fileInputRef.current?.click()} variant="outline" disabled={isImporting}>
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isImporting ? `Importing...` : 'Import from XLS'}
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx, .xls"
            />
        </div>
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

        <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search by HSN Code..."
                className="pl-8 w-full md:w-1/3"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

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
              ) : filteredTaxDetails.length > 0 ? (
                filteredTaxDetails.map((item, index) => (
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
                    No tax details found.
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
