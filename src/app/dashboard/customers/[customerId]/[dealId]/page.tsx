import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm } from "react-hook-form"
import * as z from "zod"
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import {
    addProductsToDeal,
    createQuotation,
    getDeal,
    getDealProducts,
    getDealSelections,
    getProducts,
    updateDealProducts,
    updateDealStatus
} from "./actions"
import { AllProducts, Deal, DealProduct, Product, Selection } from "@/lib/types"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Eye, Plus, Trash2 } from "lucide-react"
import { getOrders } from "../../actions"
import { Order } from "@/lib/types"
import { Timestamp } from "firebase/firestore"
import { PrintableQuotation } from "@/components/features/order-management/PrintableQuotation"

const formSchema = z.object({
    orderNo: z.string().optional(),
    selections: z.array(z.object({
        id: z.string(),
        // room: z.string(),
        // products: z.array(z.string()),
    })),
    deliveryInstallations: z.array(z.object({
        id: z.string(),
        noOfPcs: z.string().optional(),
    })).optional(),
    notes: z.string().optional(),
})

type QuotationFormValues = z.infer<typeof formSchema>

const deliveryInstallationItems = [
    { id: 'delivery', label: 'Delivery' },
    { id: 'installation', label: 'Installation' },
    { id: 'blind-installation', label: 'Blind Installation' }
]

export default function DealPage({ params }: { params: { customerId: string, dealId: string } }) {
    const router = useRouter()
    const [deal, setDeal] = useState<Deal | null>(null)
    const [products, setProducts] = useState<AllProducts>({ main: [], compatible: [] })
    const [dealProducts, setDealProducts] = useState<DealProduct[]>([])
    const [selections, setSelections] = useState<Selection[]>([])
    const [orders, setOrders] = useState<Order[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false)
    const [isSelectionDialogOpen, setIsSelectionDialogOpen] = useState(false)
    const [selectedProducts, setSelectedProducts] = useState<string[]>([])
    const [roomName, setRoomName] = useState('')
    const [isPrintPreviwOpen, setIsPrintPreviewOpen] = useState(false)
    const [selectedSelectionForPreview, setSelectedSelectionForPreview] = useState<Selection | null>(null)


    const form = useForm<QuotationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            selections: [],
            deliveryInstallations: [],
            notes: '',
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "selections"
    });

    useEffect(() => {
        const fetchDealData = async () => {
            const dealData = await getDeal(params.dealId)
            if (dealData) {
                setDeal(dealData)
                const dealProductsData = await getDealProducts(params.dealId)
                setDealProducts(dealProductsData)
                const productsData = await getProducts()
                setProducts(productsData)
                const dealSelections = await getDealSelections(params.dealId)
                setSelections(dealSelections)
                const ordersData = await getOrders(params.customerId)
                setOrders(ordersData)

                // Pre-fill form with existing selections if any
                form.setValue('selections', dealSelections.map(s => ({ id: s.id })))
            }
        }

        fetchDealData()
    }, [params.dealId, params.customerId, form])

    const onSubmit = async (data: QuotationFormValues) => {
        if (!deal) return
        setIsSubmitting(true)
        try {
            const quotationData = {
                ...data,
                dealId: params.dealId,
                customerId: params.customerId,
                createdAt: new Date(),
                status: 'pending',
                selectionIds: data.selections.map(s => s.id),
                deliveryInstallationIds: data.deliveryInstallations?.map(di => di.id) || [],
                deliveryInstallations: data.deliveryInstallations,
            }
            await createQuotation(quotationData)

            toast({
                title: "Quotation Created",
                description: "The quotation has been successfully created.",
            })
            // Optionally, navigate away or reset form
            router.push(`/dashboard/customers/${params.customerId}`)
        } catch (error) {
            console.error("Error creating quotation: ", error)
            toast({
                title: "Error",
                description: "Failed to create quotation. Please try again.",
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
            setIsQuotationDialogOpen(false)
        }
    }

    const handleCreateSelection = async () => {
        if (!roomName || selectedProducts.length === 0) {
            toast({
                title: "Error",
                description: "Please provide a room name and select at least one product.",
                variant: "destructive",
            });
            return;
        }

        const selectionData: Omit<Selection, 'id' | 'createdAt'> = {
            dealId: params.dealId,
            room: roomName,
            productIds: selectedProducts,
            // These will be calculated/set in the backend or later
            totalQty: 0,
            totalAmount: 0,
        };

        try {
            // Here you would call a server action to create the selection
            // const newSelection = await createSelection(selectionData);
            // For now, let's mock it
            const newSelection: Selection = {
                ...selectionData,
                id: `sel_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: Timestamp.now(),
                totalQty: selectedProducts.length, // Mock calculation
                totalAmount: selectedProducts.reduce((acc, productId) => {
                    const product = allProductsForSelection.find(p => p.id === productId);
                    return acc + (product?.mrp || 0);
                }, 0) // Mock calculation
            };

            setSelections([...selections, newSelection]);

            // Add to form array
            append({ id: newSelection.id });

            toast({
                title: "Selection Created",
                description: `Selection for ${roomName} has been created.`,
            });
            setIsSelectionDialogOpen(false);
            setRoomName('');
            setSelectedProducts([]);
        } catch (error) {
            console.error("Error creating selection:", error);
            toast({
                title: "Error",
                description: "Failed to create selection.",
                variant: "destructive",
            });
        }
    };


    const groupedProducts = useMemo(() => {
        return dealProducts.reduce((acc, product) => {
            const category = product.category || 'Uncategorized'
            if (!acc[category]) {
                acc[category] = []
            }
            acc[category].push(product)
            return acc
        }, {} as Record<string, DealProduct[]>)
    }, [dealProducts])

    const allProductsForSelection = useMemo(() => {
        return [...products.main, ...products.compatible]
    }, [products])

    if (!deal) {
        return <div>Loading...</div>
    }

    const handlePrint = () => {
        const printContent = document.getElementById('printable-selection-content');
        if (printContent) {
            const printWindow = window.open('', '', 'height=800,width=1200');
            printWindow?.document.write('<html><head><title>Print Selection</title>');
            // You might need to add styles here for proper printing
            printWindow?.document.write('<style>/* ... your styles ... */</style>');
            printWindow?.document.write('</head><body>');
            printWindow?.document.write(printContent.innerHTML);
            printWindow?.document.write('</body></html>');
            printWindow?.document.close();
            printWindow?.print();
        }
    };

    const calculateSelectionTotals = (selection: Selection) => {
        const totalQty = selection.productIds.length;
        const totalAmount = selection.productIds.reduce((acc, productId) => {
            const product = allProductsForSelection.find(p => p.id === productId);
            return acc + (product?.mrp || 0);
        }, 0);
        return { totalQty, totalAmount };
    };

    return (
        <div className="container mx-auto p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Deal Details</CardTitle>
                    <CardDescription>Deal ID: {deal.id}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p><strong>Customer:</strong> {deal.customerName}</p>
                    <p><strong>Salesman:</strong> {deal.salesmanName}</p>
                    <p><strong>Status:</strong> <span className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded-md">{deal.status}</span></p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Dialog open={isSelectionDialogOpen} onOpenChange={setIsSelectionDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Add New Selection</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Create New Selection</DialogTitle>
                                <DialogDescription>
                                    Select products to add to a new selection for this deal.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 flex-grow overflow-y-auto pr-2">
                                <Input
                                    placeholder="Room Name (e.g., Living Room, Bedroom 1)"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                />
                                <div className="space-y-4">
                                    {allProductsForSelection.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[50px]">Select</TableHead>
                                                    <TableHead>Product Name</TableHead>
                                                    <TableHead>Collection</TableHead>
                                                    <TableHead>MRP</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {allProductsForSelection.map(product => (
                                                    <TableRow key={product.id}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedProducts.includes(product.id)}
                                                                onCheckedChange={(checked) => {
                                                                    setSelectedProducts(prev =>
                                                                        checked
                                                                            ? [...prev, product.id]
                                                                            : prev.filter(id => id !== product.id)
                                                                    )
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{product.name}</TableCell>
                                                        <TableCell>{product.collection}</TableCell>
                                                        <TableCell>₹{product.mrp.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p>No products available to add.</p>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsSelectionDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreateSelection}>Create Selection</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isQuotationDialogOpen} onOpenChange={setIsQuotationDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>Create Quotation</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>Create New Quotation</DialogTitle>
                                <DialogDescription>
                                    Review and confirm the details for the new quotation.
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                    <div className="space-y-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>

                                        <FormField
                                            control={form.control}
                                            name="selections"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <div className="mb-4">
                                                        <FormLabel className="text-base font-semibold">Selections</FormLabel>
                                                        <FormDescription>
                                                            Select the combinations of products to include in this quotation.
                                                        </FormDescription>
                                                    </div>
                                                    {selections.map((selection) => (
                                                        <FormField
                                                            key={selection.id}
                                                            control={form.control}
                                                            name="selections"
                                                            render={({ field }) => {
                                                                return (
                                                                    <FormItem
                                                                        key={selection.id}
                                                                        className="flex flex-row items-start space-x-3 space-y-0"
                                                                    >
                                                                        <FormControl>
                                                                            <Checkbox
                                                                                checked={field.value?.some(s => s.id === selection.id)}
                                                                                onCheckedChange={(checked) => {
                                                                                    return checked
                                                                                        ? field.onChange([...field.value, { id: selection.id }])
                                                                                        : field.onChange(
                                                                                            field.value?.filter(
                                                                                                (value) => value.id !== selection.id
                                                                                            )
                                                                                        )
                                                                                }}
                                                                            />
                                                                        </FormControl>
                                                                        <FormLabel className="font-normal">
                                                                            {`Selection for ${selection.room} (${selection.productIds.length} items)`}
                                                                        </FormLabel>
                                                                    </FormItem>
                                                                )
                                                            }}
                                                        />
                                                    ))}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <Separator />

                                        <FormField
                                            control={form.control}
                                            name="orderNo"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Link to Sales Order</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select an order to link" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {orders.map(order => (
                                                                <SelectItem key={order.id} value={order.orderNo}>
                                                                    {order.orderNo}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Delivery/Installation Column */}
                                            <div className="space-y-3">
                                                <FormLabel className="font-semibold">Delivery/Installation</FormLabel>
                                                {deliveryInstallationItems.map((item) => (
                                                    <div key={item.id} className="flex items-center gap-2">
                                                        <FormField
                                                            control={form.control}
                                                            name="deliveryInstallations"
                                                            render={({ field }) => (
                                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.some(v => v?.id === item.id)}
                                                                            onCheckedChange={(checked) => {
                                                                                const currentValues = field.value || [];
                                                                                if (checked) {
                                                                                    field.onChange([...currentValues, { id: item.id, noOfPcs: '1' }]);
                                                                                } else {
                                                                                    field.onChange(currentValues.filter(v => v?.id !== item.id));
                                                                                }
                                                                            }}
                                                                        />
                                                                    </FormControl>
                                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                </FormItem>
                                                            )}
                                                        />
                                                        {item.id !== 'blind-installation' && (
                                                            <FormField
                                                                control={form.control}
                                                                name={\`deliveryInstallations.${form.watch('deliveryInstallations')?.findIndex(d => d?.id === item.id)}.noOfPcs\`}
                                                                render={({ field }) => (
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            className="h-7 w-20"
                                                                            placeholder="Pcs"
                                                                            disabled={!form.watch('deliveryInstallations')?.some(v => v?.id === item.id)}
                                                                            onChange={(e) => {
                                                                                const index = form.getValues('deliveryInstallations')?.findIndex(d => d?.id === item.id);
                                                                                if (index !== -1 && index !== undefined) {
                                                                                    const newValues = [...form.getValues('deliveryInstallations') || []];
                                                                                    newValues[index] = { ...newValues[index], noOfPcs: e.target.value };
                                                                                    form.setValue('deliveryInstallations', newValues);
                                                                                }
                                                                            }}
                                                                            value={field.value}
                                                                        />
                                                                    </FormControl>
                                                                )}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Notes Column */}
                                            <div className="space-y-3">
                                                <FormField
                                                    control={form.control}
                                                    name="notes"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="font-semibold">Notes</FormLabel>
                                                            <FormControl>
                                                                <Textarea
                                                                    placeholder="Add any notes for the quotation..."
                                                                    className="resize-none"
                                                                    {...field}
                                                                    rows={5}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>

                                    </div>
                                    <DialogFooter>
                                        <Button type="button" variant="ghost" onClick={() => setIsQuotationDialogOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? "Creating..." : "Create Quotation"}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                </CardFooter>
            </Card>

            <Separator className="my-6" />

            {/* Selections Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Selections</CardTitle>
                    <CardDescription>
                        All selections created for this deal.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Selection ID</TableHead>
                                <TableHead>Room</TableHead>
                                <TableHead className="text-right">Total Qty</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead className="text-center">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selections.length > 0 ? (
                                selections.map((selection) => {
                                    const { totalQty, totalAmount } = calculateSelectionTotals(selection);
                                    return (
                                        <TableRow key={selection.id}>
                                            <TableCell className="font-medium">#{selection.id.slice(-4)}</TableCell>
                                            <TableCell>{selection.room}</TableCell>
                                            <TableCell className="text-right">{totalQty}</TableCell>
                                            <TableCell className="text-right">₹{totalAmount.toFixed(2)}</TableCell>
                                            <TableCell className="text-center">
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    setSelectedSelectionForPreview(selection)
                                                    setIsPrintPreviewOpen(true)
                                                }}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No selections created yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isPrintPreviwOpen} onOpenChange={setIsPrintPreviewOpen}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Selection Preview</DialogTitle>
                        <DialogDescription>
                            Previewing selection #{selectedSelectionForPreview?.id.slice(-4)} for room {selectedSelectionForPreview?.room}
                        </DialogDescription>
                    </DialogHeader>
                    <div id="printable-selection-content" className="flex-grow overflow-y-auto pr-4">
                        {selectedSelectionForPreview && (
                             <PrintableQuotation
                             // This is a placeholder, you might need a specific component for single selections
                             // Or adjust PrintableQuotation to handle this case.
                             selections={[selectedSelectionForPreview]}
                             deal={deal}
                             products={selectedSelectionForPreview.productIds.map(pid => allProductsForSelection.find(p=>p.id === pid)).filter(p => p) as Product[]}
                           />
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Close</Button>
                        <Button onClick={handlePrint}>Print / Download PDF</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Separator className="my-6" />


            <Card>
                <CardHeader>
                    <CardTitle>Products in Deal</CardTitle>
                    <CardDescription>Manage products associated with this deal.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {Object.entries(groupedProducts).map(([category, products]) => (
                            <div key={category}>
                                <h3 className="text-lg font-semibold mb-2">{category}</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product Name</TableHead>
                                            <TableHead>Collection</TableHead>
                                            <TableHead>Color</TableHead>
                                            <TableHead>Finish</TableHead>
                                            <TableHead className="text-right">MRP</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {products.map(product => (
                                            <TableRow key={product.id}>
                                                <TableCell>{product.name}</TableCell>
                                                <TableCell>{product.collection}</TableCell>
                                                <TableCell>{product.color}</TableCell>
                                                <TableCell>{product.finish}</TableCell>
                                                <TableCell className="text-right">₹{product.mrp.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{product.quantity}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon">
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
