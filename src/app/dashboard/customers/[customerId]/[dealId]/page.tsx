
"use client";

import { use, useEffect, useState, useMemo, useCallback, ReactNode } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext, Control, UseFormReturn, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Customer, Deal, User, Stock, DealProduct, Quotation, DealOrder, DealVisit, DealMeasurement, DeliveryInstallationItem, Cpd } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Contact,
  FileText,
  GanttChartSquare,
  Home,
  MessageSquare,
  Package,
  Plane,
  Receipt,
  ShoppingCart,
  User as UserIcon,
  Info,
  CalendarDays,
  Clock,
  Loader2,
  PlusCircle,
  Calculator,
  Trash2,
  Edit,
  RefreshCw,
  Check,
  MoreVertical,
  Printer,
  Copy,
  FileDown,
  Eye,
  Contact2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById, updateDealProducts, getQuotationsForDeal, getOrdersForDeal, addVisitAction, getVisitsForDeal, addMeasurementAction, getMeasurementsForDeal, addCpdAction, getCpdsForDeal } from "./actions";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { PrintableQuotation } from "@/components/features/order-management/PrintableQuotation";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export const deliveryInstallationItemSchema = z.object({
  id: z.string(),
  noOfPcs: z.string().optional(),
});

const visitSchema = z.object({
    representative: z.string().min(1, "Representative is required."),
    date: z.date({ required_error: "A date is required." }),
    time: z.string({ required_error: "A time is required." }),
    // Measurement fields
    measurements: z.array(z.string()).optional(),
    blinds: z.array(z.string()).optional(),
    curtain: z.array(z.string()).optional(),
    otherCurtain: z.string().optional(),
    // Delivery fields
    deliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    subDeliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    otherDelivery: z.string().optional(),
});


export type VisitFormValues = z.infer<typeof visitSchema>;

const measurementSchema = z.object({
    room: z.string().min(1, "Room is required."),
    measurementReference: z.string().min(1, "Measurement reference is required."),
    noOfUnits: z.string().min(1, "Number of units is required."),
    measurement: z.string().max(2000, "Measurement cannot exceed 2000 characters.").min(1, "Measurement is required."),
    file: z.any().optional(),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

const productSchema = z.object({
    id: z.string().optional(),
    productCategory: z.string().optional().default(''),
    collectionBrand: z.string().min(1, "Collection/Brand is required."), // This will now hold the BCN
    serialNo: z.string().optional().default(''),
    salesDescription: z.string().optional().default(''),
    quantity: z.string().min(1, "Quantity is required."),
    remarks: z.string().optional().default(''),
    room: z.string().optional().default(''),
    noOfPcs: z.string().optional().default('1'),
    info1: z.string().optional().default(''),
    info2: z.string().optional().default(''),
    stitchingType: z.enum(["in", "out"]).optional(),
    file: z.any().optional(),
    pushToMeasurement: z.boolean().default(false),
});

const productListSchema = z.object({
    products: z.array(productSchema)
})

type ProductFormValues = z.infer<typeof productSchema>;
type ProductListFormValues = z.infer<typeof productListSchema>;

export const roomOptions = [
    { value: "kids-room", label: "KIDS ROOM" },
    { value: "bedroom", label: "BEDROOM" },
    { value: "master-bedroom", label: "MASTER BEDROOM" },
    { value: "bedroom-1", label: "BEDROOM - 1" },
    { value: "bedroom-2", label: "BEDROOM - 2" },
    { value: "bedroom-3", label: "BEDROOM - 3" },
    { value: "bedroom-4", label: "BEDROOM - 4" },
    { value: "drawing-room", label: "DRAWING ROOM" },
    { value: "dining-room", label: "DINING ROOM" },
    { value: "kitchen-room", label: "KITCHEN ROOM" },
    { value: "son-room", label: "SON ROOM" },
    { value: "daughter-room", label: "DAUGHTER ROOM" },
    { value: "parents-room", label: "PARENTS ROOM" },
    { value: "boys-room", label: "BOYS ROOM" },
    { value: "girls-room", label: "GIRLS ROOM" },
    { value: "guest-room", label: "GUEST ROOM" },
    { value: "office-area", label: "OFFICE AREA" },
    { value: "all-room", label: "ALL ROOM" },
    { value: "drawing-room-ground-floor", label: "DRAWING ROOM GROUND FLOOR" },
    { value: "master-and-parrents-room", label: "MASTER AND PARRENTS ROOM" },
    { value: "first-floor-bedroom", label: "FIRST FLOOR BEDROOM" },
    { value: "first-floor-lounge", label: "FIRST FLOOR LOUNGE" },
    { value: "ground-floor-bedroom", label: "GROUND FLOOR BEDROOM" },
    { value: "study-room", label: "STUDY ROOM" },
    { value: "family-lounge", label: "FAMILY LOUNGE" },
    { value: "secon-floor-family-lounge", label: "SECON FLOOR FAMILY LOUNGE" },
    { value: "powder-room", label: "POWDER ROOM" },
    { value: "game-room", label: "GAME ROOM" },
    { value: "play-room", label: "PLAY ROOM" },
    { value: "powder-bathroom", label: "POWDER BATHROOM" },
    { value: "children-room", label: "CHILDREN ROOM" },
    { value: "mother-room", label: "MOTHER ROOM" },
    { value: "father-room", label: "FATHER ROOM" },
    { value: "ground-floor-intrance", label: "GROUND FLOOR INTRANCE" },
    { value: "ground-floor-entrance", label: "GROUND FLOOR ENTRANCE" },
    { value: "all-room-single-channel", label: "ALL ROOM SINGLE CHANNEL" },
    { value: "1st-floor-master-bed-room", label: "1ST FLOOR MASTER BED ROOM" },
    { value: "2nd-floor-drawing", label: "2ND FLOOR DRAWING" },
    { value: "ground-floor-bed-room-2", label: "GROUND FLOOR BED ROOM 2" },
    { value: "ground-floor-brd-room-3", label: "GROUND FLOOR BRD ROOM 3" },
    { value: "ground-floor-loung", label: "GROUND FLOOR LOUNG" },
    { value: "1st-floor-bed-room", label: "1ST FLOOR BED ROOM" },
    { value: "master-bedroom1", label: "MASTER BEDROOM1" },
    { value: "tv-room", label: "TV ROOM" },
    { value: "kids-and-guest-room", label: "KIDS AND GUEST ROOM" },
    { value: "bed-room-1&2&3&4", label: "BED ROOM 1&2&3&4" },
    { value: "temple", label: "TEMPLE" },
    { value: "kitchen", label: "KITCHEN" },
    { value: "shohosh-room", label: "SHOHOH ROOM" },
    { value: "ground-floor-lounge", label: "GROUND FLOOR LOUNGE" },
    { value: "second-floor-bedroom", label: "SECOND FLOOR BEDROOM" },
    { value: "second-floor-lounge", label: "SECOND FLOOR LOUNGE" },
    { value: "second-floor-master-bed-room", label: "SECOND FLOOR MASTER BED ROOM" },
    { value: "first-floor-master-bed-room", label: "FIRST FLOOR MASTER BED ROOM" },
    { value: "living-&-dining-room", label: "LIVING & DINING ROOM" },
    { value: "loung", label: "LOUNG" },
    { value: "all-bed-room", label: "ALL BED ROOM" },
    { value: "living-room", label: "LIVING ROOM" },
    { value: "0ther-fabrics", label: "0THER FABRICS" },
    { value: "den-room", label: "DEN ROOM" },
    { value: "common-room", label: "COMMON ROOM" },
    { value: "2-room", label: "2 ROOM" },
    { value: "sofa-work", label: "SOFA WORK" },
    { value: "partition", label: "PARTITION" },
    { value: "first-floor-guest-bed-room--1", label: "FIRST FLOOR GUEST BED ROOM -1" },
    { value: "first-floor-guest-bed-room-2", label: "FIRST FLOOR GUEST BED ROOM-2" },
    { value: "deawing-&-dining-room", label: "DEAWING & DINING ROOM" },
    { value: "drawing-&-dining-room", label: "DRAWING & DINING ROOM" },
    { value: "nursary-room", label: "NURSARY ROOM" },
    { value: "noor-room", label: "NOOR ROOM" },
    { value: "pooja-room", label: "POOJA ROOM" },
    { value: "reshma-room", label: "RESHMA ROOM" },
    { value: "anurg-office", label: "ANURG OFFICE" },
    { value: "sandeep-office", label: "SANDEEP OFFICE" },
    { value: "besement", label: "BESEMENT" },
    { value: "lobby", label: "LOBBY" },
    { value: "tample", label: "TAMPLE" },
    { value: "meeting-room", label: "MEETING ROOM" },
    { value: "study-ff", label: "STUDY FF" },
    { value: "mbr-1st-floor", label: "MBR 1ST FLOOR" },
    { value: "younger-son-room", label: "YOUNGER SON ROOM" },
    { value: "study-sf", label: "STUDY SF" },
    { value: "elder-son-sf", label: "ELDER SON SF" },
    { value: "daughters-room", label: "DAUGHTERS ROOM" },
    { value: "bathroom", label: "BATHROOM" },
    { value: "mbr-gf", label: "MBR GF" },
    { value: "living-room-ff", label: "LIVING ROOM FF" },
    { value: "living-room-sf", label: "LIVING ROOM SF" },
    { value: "mbr-sf", label: "MBR SF" },
    { value: "double-height-gf", label: "DOUBLE HEIGHT GF" },
    { value: "living-room-1", label: "LIVING ROOM 1" },
    { value: "living-2", label: "LIVING 2" },
    { value: "bed-room-2-heavy", label: "BED ROOM 2 HEAVY" },
    { value: "living-2-havey", label: "LIVING 2 HAVEY" },
    { value: "bhath-room", label: "BHATH ROOM" },
    { value: "studio-room", label: "STUDIO ROOM" },
    { value: "work-station", label: "WORK STATION" },
    { value: "mbr&kids-room", label: "MBR&KIDS ROOM" },
    { value: "mbr-&-mother-room", label: "MBR & MOTHER ROOM" },
    { value: "sarvant-room", label: "SARVANT ROOM" },
    { value: "guest-room-2", label: "GUEST ROOM 2" },
    { value: "guest-room-1-and-2", label: "GUEST ROOM 1 AND 2" },
    { value: "baqsing-room", label: "BAQSING ROOM" },
    { value: "wqsing-room", label: "WQSING ROOM" },
    { value: "bed-room-1+3+4", label: "BED ROOM 1+3+4" },
    { value: "bed-room-2&3", label: "BED ROOM 2&3" },
    { value: "play-hause-inside", label: "PLAY HAUSE INSIDE" },
    { value: "back-right-bed-room", label: "BACK RIGHT BED ROOM" },
    { value: "fornt-bed-room", label: "FORNT BED ROOM" },
    { value: "lounge", label: "LOUNGE" },
    { value: "all-area", label: "ALL AREA" },
    { value: "guest&master-bedroom", label: "GUEST&MASTER BEDROOM" },
    { value: "sons-room", label: "SONS ROOM" },
    { value: "simern-room", label: "SIMERN ROOM" },
    { value: "center-room", label: "CENTER ROOM" },
    { value: "ground-floor-gust-room", label: "GROUND FLOOR GUST ROOM" },
    { value: "fast-floor-famliy-room", label: "FAST FLOOR FAMLIY ROOM" },
    { value: "fast-floor-master-bed-room", label: "FAST FLOOR MASTER BED ROOM" },
    { value: "fast-floor-gust-room", label: "FAST FLOOR GUST ROOM" },
    { value: "2nd-floor-bedroom-1", label: "2ND FLOOR BEDROOM 1" },
    { value: "2nd-floor-bedroom-2", label: "2ND FLOOR BEDROOM 2" },
    { value: "2nd-floor-famliy-room", label: "2ND FLOOR FAMLIY ROOM" },
    { value: "stair-case", label: "STAIR CASE" },
    { value: "sons-room-bed", label: "SONS ROOM BED" },
    { value: "sons-room-bed-fabric", label: "SONS ROOM BED FABRIC" },
    { value: "sons-room-sofa-sheet", label: "SONS ROOM SOFA SHEET" },
    { value: "sons-room-sofa-back", label: "SONS ROOM SOFA BACK" },
    { value: "sons-room-wadrobe", label: "SONS ROOM WADROBE" },
    { value: "master-bed-room-rocking-chair", label: "MASTER BED ROOM ROCKING CHAIR" },
    { value: "master-bed-room-rocking-chair-sheet", label: "MASTER BED ROOM ROCKING CHAIR SHEET" },
    { value: "sons", label: "SONS" },
    { value: "drawing-+-dining-&-bedroom-1", label: "DRAWING + DINING & BEDROOM 1" },
    { value: "caeved-chair", label: "CAEVED CHAIR" },
    { value: "ramik-room", label: "RAMIK ROOM" },
    { value: "manik-room", label: "MANIK ROOM" },
    { value: "nikhel-room", label: "NIKHEL ROOM" },
    { value: "dressing-room", label: "DRESSING ROOM" },
    { value: "piyush-room", label: "PIYUSH ROOM" },
    { value: "2nd-floor-guest-room", label: "2ND FLOOR GUEST ROOM" },
    { value: "nanas-ji-room", label: "NANAS JI ROOM" },
    { value: "stone-room", label: "STONE ROOM" },
    { value: "media-loung-room", label: "MEDIA LOUNG ROOM" },
    { value: "styar-jina", label: "STYAR JINA" },
    { value: "bani-room", label: "BANI ROOM" },
    { value: "master-bed-room-pannel-side", label: "MASTER BED ROOM PANNEL SIDE" },
    { value: "master-room-bed-side", label: "MASTER ROOM BED SIDE" },
    { value: "bedroom-1-is-master-bed-room", label: "BEDROOM-1 IS MASTER BED ROOM" },
    { value: "bedroom-2-is-father-room", label: "BEDROOM-2 IS FATHER ROOM" },
    { value: "drawing+dining+lounge-room", label: "DRAWING+DINING+LOUNGE ROOM" },
    { value: "parents+master-bedroom", label: "PARENTS+MASTER BEDROOM" },
    { value: "hall", label: "HALL" },
    { value: "glass-room", label: "GLASS ROOM" },
    { value: "confrence-room", label: "CONFRENCE ROOM" },
    { value: "top-floor-bedroom", label: "TOP FLOOR BEDROOM" },
    { value: "store-room", label: "STORE ROOM" },
    { value: "somya-room", label: "SOMYA ROOM" },
    { value: "balcony-window", label: "BALCONY WINDOW" },
    { value: "sitting-sofa", label: "SITTING SOFA" },
    { value: "loft-room", label: "LOFT ROOM" },
    { value: "nursery-room", label: "NURSERY ROOM" },
    { value: "drawing&-dining-&-bar-room", label: "DRAWING& DINING & BAR ROOM" },
    { value: "sofa-master-room", label: "SOFA MASTER ROOM" },
    { value: "foyer-sofa", label: "FOYER SOFA" },
    { value: "foyer-chair", label: "FOYER CHAIR" },
    { value: "drawing-sofa", label: "DRAWING SOFA" },
    { value: "livning-wooden-sofa", label: "LIVNING WOODEN SOFA" },
    { value: "t.v-room-sofa", label: "T.V ROOM SOFA" },
    { value: "wicker-chair", label: "WICKER CHAIR" },
    { value: "master-bed-head", label: "MASTER BED HEAD" },
    { value: "all-room-channels", label: "ALL ROOM CHANNELS" },
    { value: "library", label: "LIBRARY" },
    { value: "ground-floor-office", label: "GROUND FLOOR OFFICE" },
    { value: "bench-fabric", label: "BENCH FABRIC" },
    { value: "sofa", label: "SOFA" },
    { value: "chair-fabric", label: "CHAIR FABRIC" },
    { value: "fish-point-room", label: "FISH POINT ROOM" },
    { value: "drawing-and-master-room", label: "DRAWING AND MASTER ROOM" },
    { value: "pantry-room", label: "PANTRY ROOM" },
    { value: "maid-room", label: "MAID ROOM" },
    { value: "2-seat-wooden-sofa", label: "2 SEAT WOODEN SOFA" },
    { value: "didi-room", label: "DIDI ROOM" },
    { value: "drawing-room-2", label: "DRAWING ROOM 2" },
    { value: "1st-floor-guest-bed-room", label: "1ST FLOOR GUEST BED ROOM" },
    { value: "1st-floor-drawing-room", label: "1ST FLOOR DRAWING ROOM" },
    { value: "1st-floor-mother-room", label: "1ST FLOOR MOTHER ROOM" },
    { value: "ground-floor-mother-room", label: "GROUND FLOOR MOTHER ROOM" },
    { value: "pantry", label: "PANTRY" },
    { value: "office-room", label: "OFFICE ROOM" },
    { value: "fast-floor-lounge", label: "FAST FLOOR LOUNGE" },
    { value: "dev-room", label: "DEV ROOM" },
    { value: "shivani-room", label: "SHIVANI ROOM" },
    { value: "khushi-room", label: "KHUSHI ROOM" },
    { value: "office", label: "OFFICE" },
    { value: "big-room", label: "BIG ROOM" },
    { value: "1st-floor-office", label: "1ST FLOOR OFFICE" },
    { value: "ishnoor-room", label: "ISHNOOR ROOM" },
    { value: "foyar-arey", label: "FOYAR AREY" },
    { value: "ground-floor-jeena", label: "GROUND FLOOR JEENA" },
    { value: "vinayak-room", label: "VINAYAK ROOM" },
    { value: "first-fioor-jeena", label: "FIRST FIOOR JEENA" },
    { value: "restorent", label: "RESTORENT" },
    { value: "bar-area", label: "BAR AREA" },
    { value: "back-bedroom", label: "BACK BEDROOM" },
    { value: "jai-room", label: "JAI ROOM" },
    { value: "mother-+master-+guest-room", label: "MOTHER +MASTER +GUEST ROOM" },
    { value: "living-+dining+study", label: "LIVING +DINING+STUDY" },
    { value: "master-+-lift-lobby", label: "MASTER + LIFT LOBBY" },
    { value: "guest+mother-room", label: "GUEST+MOTHER ROOM" },
    { value: "guest-+-mother-room", label: "GUEST +MOTHER ROOM" },
    { value: "garden", label: "GARDEN" },
    { value: "basment", label: "BASMENT" },
    { value: "kitchen-+bathroom", label: "KITCHEN +BATHROOM" },
    { value: "3rd-floor", label: "3RD FLOOR" },
    { value: "out-door", label: "OUT DOOR" },
    { value: "riya-room", label: "RIYA ROOM" },
    { value: "aaraov", label: "AARAOV" },
    { value: "landry", label: "LANDRY" },
    { value: "2-floor-long", label: "2 FLOOR LONG" },
    { value: "2-floor-bed-room", label: "2 FLOOR BED ROOM" },
    { value: "1st-floor-bed-room-1", label: "1ST FLOOR BED ROOM 1" },
    { value: "1st-floor-bed-room-2", label: "1ST FLOOR BED ROOM 2" },
    { value: "windows,-no-1-&-3", label: "WINDOWS, NO-1 & 3" },
    { value: "windows,-no-2", label: "WINDOWS, NO-2" },
    { value: "raghavs-room", label: "RAGHAVS ROOM" },
    { value: "keshavs-room", label: "KESHAVS ROOM" },
    { value: "t.v-lounga", label: "T.V LOUNGA" },
    { value: "entrance-bench", label: "ENTRANCE BENCH" },
    { value: "bed", label: "BED" },
    { value: "billiard-room", label: "BILLIARD ROOM" },
    { value: "tea-room", label: "TEA ROOM" },
    { value: "coco-room", label: "COCO ROOM" },
    { value: "frount-bed-room", label: "FROUNT BED ROOM" },
    { value: "parth-bed-room", label: "PARTH BED ROOM" },
    { value: "purnima-bed-room", label: "PURNIMA BED ROOM" },
    { value: "office-intry", label: "OFFICE INTRY" },
    { value: "arch-window", label: "ARCH WINDOW" },
    { value: "besment", label: "BESMENT" },
    { value: "t.v-lounge", label: "T.V LOUNGE" },
    { value: "master-bedroom-entrance-door", label: "MASTER BEDROOM ENTRANCE DOOR" },
    { value: "ground-floor-staircase", label: "GROUND FLOOR STAIRCASE" },
    { value: "big-window-curtain", label: "BIG WINDOW CURTAIN" },
    { value: "smol-window-blind", label: "SMOL WINDOW BLIND" },
    { value: "br2-&-br-3", label: "BR2 & BR 3" },
    { value: "dr-&-br-1", label: "DR & BR 1" },
    { value: "guest-bed-room-3", label: "GUEST BED ROOM 3" },
    { value: "master-bedroom-2", label: "MASTER BEDROOM 2" },
    { value: "dining-chair", label: "DINING CHAIR" },
    { value: "master+guest+kids-room", label: "MASTER+GUEST+KIDS ROOM" },
    { value: "ananya-room", label: "ANANYA ROOM" },
    { value: "terrace", label: "TERRACE" },
    { value: "siting-room", label: "SITING ROOM" },
    { value: "study-room+guest-room--1&2", label: "STUDY ROOM+GUEST ROOM -1&2" },
    { value: "study-room+mother-room", label: "STUDY ROOM+MOTHER ROOM" },
    { value: "drawing+guest-room", label: "DRAWING+GUEST ROOM" },
    { value: "karan-bedroom", label: "KARAN BEDROOM" },
    { value: "kevin-bedroom", label: "KEVIN BEDROOM" },
    { value: "dought-room", label: "DOUGHTER ROOM" },
    { value: "dada&dadi-+nana&nani-room", label: "DADA&DADI +NANA&NANI ROOM" },
    { value: "m-b-r-2", label: "M B R 2" },
    { value: "master-bed-room-small-wall", label: "MASTER BED ROOM SMALL WALL" },
    { value: "master-big-wall", label: "MASTER BIG WALL" },
    { value: "master-small-wall", label: "MASTER SMALL WALL" },
    { value: "prakhar", label: "PRAKHAR" },
    { value: "sofa-fabric", label: "SOFA FABRIC" },
    { value: "dad-room", label: "DAD ROOM" },
    { value: "nitin-room", label: "NITIN ROOM" },
    { value: "medha-room", label: "MEDHA ROOM" },
    { value: "second-floor-kids", label: "SECOND FLOOR KIDS" },
    { value: "garden-out-house", label: "GARDEN OUT HOUSE" },
    { value: "bed-room-3-wall-1", label: "BED ROOM 3 WALL 1" },
];

export const visitTypeOptions = [
    { value: "measurements", label: "Measurements" },
    { value: "fittings", label: "Fittings" },
    { value: "complaint", label: "Complaint" },
    { value: "tempo", label: "Tempo" },
    { value: "selection", label: "Selection" },
    { value: "other", label: "Other" },
];

export const measurementItems = [
    { id: 'curtain-measurement', label: 'Curtain Measurement' },
    { id: 'sofa-measurement', label: 'Sofa Measurement' },
    { id: 'blind-measurement', label: 'Blind Measurement' },
    { id: 'rod-and-channel-measurement', label: 'Rod and Channel Measurement' },
    { id: 'motorize-channel-measurement', label: 'Motorize Channel Measurement' },
    { id: 'wallpaper-measurement', label: 'Wallpaper measurement' },
    { id: 'furniture-measurement', label: 'Furniture Measurement' },
    { id: 'mattress-measurement', label: 'Mattress Measurement' },
    { id: 'wall-to-wall-measurement', label: 'Wall to Wall Measurement' },
    { id: 're-measurement', label: 'Re-Measurement' },
];

export const subMeasurementBlinds = [
    { id: 'roman-blind', label: 'Roman Blind' },
    { id: 'roller-blind', label: 'Roller Blind' },
    { id: 'wooden-blind', label: 'Wooden Blind' },
];

export const subMeasurementCurtain = [
    { id: 'three-pleat', label: 'Three Pleat' },
    { id: 'eyelet', label: 'Eyelet' },
    { id: 'other', label: 'Other' },
];

export const deliveryInstallationItems = [
    { id: 'curtain-installation', label: 'Curtain Installation' },
    { id: 'blind-installation', label: 'Blind Installation' },
    { id: 'rod-channel-installation', label: 'Rod+Channel installation' },
    { id: 'motorize-channel-installation', label: 'Motorize Channel Installation' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'other', label: 'Other' },
];

export const subDeliveryInstallationItems = [
    { id: 'roman-blind', label: 'Roman Blind' },
    { id: 'roller-blind', label: 'Roller Blind' },
    { id: 'wooden-blind', label: 'Wooden Blind' },
];

const cpdItemSchema = z.object({
  itemName: z.string().optional(),
  type: z.string().optional(),
  qty: z.string().optional(),
  rate: z.string().optional(),
  dis: z.string().optional(),
  gst: z.string().optional(),
  amount: z.string().optional(),
});

const cpdRoomSchema = z.object({
  room: z.string().optional(),
  items: z.array(cpdItemSchema),
});

const cpdSchema = z.object({
  representative: z.string().optional(),
  customerName: z.string().optional(),
  telNo: z.string().optional(),
  date: z.string().optional(),
  rooms: z.array(cpdRoomSchema),
});

export type CpdFormValues = z.infer<typeof cpdSchema>;

export const productTypeOptions = [
    { value: "fabric", label: "Fabric" },
    { value: "rod", label: "Rod" },
    { value: "channel", label: "Channel" },
    { value: "roman-channel", label: "Roman Channel" },
    { value: "wooden-blind", label: "Wooden Blind" },
    { value: "tesal", label: "Tesal" },
    { value: "stick", label: "Stick" },
    { value: "knobs", label: "Knobs" },
    { value: "accessorise", label: "Accessorise" },
];

function CpdForm({ customer, salesmen, dealId }: { customer: Customer, salesmen: User[], dealId: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const form = useForm<CpdFormValues>({
        resolver: zodResolver(cpdSchema),
        defaultValues: {
            customerName: customer.name,
            telNo: customer.mobileNo,
            date: format(new Date(), "yyyy-MM-dd"),
            rooms: [{ room: "", items: [{}] }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "rooms"
    });
    
    const onSubmit = async (data: CpdFormValues) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }
        setLoading(true);
        try {
            const result = await addCpdAction(customer.id, dealId, data, user.name);
            if (result.success) {
                toast({ title: 'Success', description: 'CPD has been saved.' });
                form.reset(); // Optionally reset form
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Top section */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="representative"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Representative</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Salesman" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="customerName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Customer Name</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="telNo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tele. No</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date</FormLabel>
                                        <FormControl><Input type="date" {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Separator />

                        {/* Rooms Section */}
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <RoomFields key={field.id} roomIndex={index} onRemoveRoom={() => remove(index)} />
                            ))}
                        </div>

                         <Button type="button" onClick={() => append({ room: "", items: [{}] })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Another Room
                        </Button>
                        
                         <div className="form-footer flex justify-end items-center gap-4 pt-4 border-t">
                            <p className="text-sm text-destructive mr-auto">Please click on Update Activity if you have updated any changes.</p>
                            <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

function RoomFields({ roomIndex, onRemoveRoom }: { roomIndex: number, onRemoveRoom: () => void }) {
    const { control, setValue } = useFormContext<CpdFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items`
    });
    
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearchingBcn, setIsSearchingBcn] = useState(false);

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) { setBcnOptions([]); return; }
        setIsSearchingBcn(true);
        try {
            const results = await searchStockByBcn(query);
            setBcnOptions(results.map(stock => ({ value: stock.bcn || stock.id, label: stock.bcn || stock.id, stockItem: stock })));
        } catch (error) {
            console.error("Error searching BCN:", error);
            toast({ variant: 'destructive', title: 'Search failed' });
        } finally {
            setIsSearchingBcn(false);
        }
    };

    return (
        <Card className="p-4 bg-muted/30">
            <div className="flex justify-between items-center mb-4">
                 <FormField
                    control={control}
                    name={`rooms.${roomIndex}.room`}
                    render={({ field }) => (
                        <FormItem className="w-1/3">
                            <FormLabel>Room</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select Room" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {roomOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />
                 <Button type="button" variant="destructive" size="sm" onClick={onRemoveRoom}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remove Room
                </Button>
            </div>
            
             <div className="space-y-2">
                {fields.map((item, itemIndex) => (
                    <div key={item.id} className="p-3 border rounded-md bg-background flex items-end gap-2">
                        <div className="grid grid-cols-2 gap-2 flex-grow">
                             <Controller
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.itemName`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs">Item Name (BCN)</FormLabel>
                                        <Combobox 
                                            options={bcnOptions}
                                            value={field.value}
                                            onSelect={(value) => {
                                                field.onChange(value);
                                                const selectedOption = bcnOptions.find(opt => opt.value === value);
                                                if (selectedOption) {
                                                    const rate = selectedOption.stockItem.mrp?.toString() || '';
                                                    setValue(`rooms.${roomIndex}.items.${itemIndex}.rate`, rate);
                                                }
                                            }}
                                            onSearch={handleBcnSearch}
                                            placeholder="Search by BCN..."
                                        />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.type`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs">Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {productTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-2 flex-grow">
                             <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.qty`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Qty</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.rate`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Rate</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.dis`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Dis%</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                            <FormField
                                control={control}
                                name={`rooms.${roomIndex}.items.${itemIndex}.gst`}
                                render={({ field }) => ( <FormItem><FormLabel className="text-xs">Gst%</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )}
                            />
                        </div>
                        <FormField
                            control={control}
                            name={`rooms.${roomIndex}.items.${itemIndex}.amount`}
                            render={({ field }) => ( <FormItem><FormLabel className="text-xs">Amount</FormLabel><FormControl><Input {...field} readOnly /></FormControl></FormItem> )}
                        />

                         <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => remove(itemIndex)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
             </div>
             <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({})}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
        </Card>
    );
}

function VisitForm({ salesmen, customerId, dealId, onVisitAdded, visits }: { salesmen: User[], customerId: string, dealId: string, onVisitAdded: (visit: DealVisit) => void, visits: DealVisit[] }) {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('measurement');
    const { toast } = useToast();
    const { user } = useAuth();
    
    const hasMeasurementVisit = useMemo(() => visits.some(v => v.typeOfVisit === 'measurement'), [visits]);

    const form = useForm<VisitFormValues>({
        resolver: zodResolver(visitSchema),
        defaultValues: {
            representative: "",
            date: new Date(),
            time: format(new Date(), "HH:mm"),
            measurements: [],
            blinds: [],
            curtain: [],
            otherCurtain: '',
            deliveryInstallations: [],
            subDeliveryInstallations: [],
            otherDelivery: '',
        }
    });

    const watchedMeasurements = form.watch("measurements");
    const watchedDeliveryInstallations = form.watch("deliveryInstallations");

    async function onSubmit(data: VisitFormValues) {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
            return;
        }
        setLoading(true);
        try {
            const [hours, minutes] = data.time.split(':').map(Number);
            const combinedDateTime = new Date(data.date);
            combinedDateTime.setHours(hours, minutes);

            const visitDataForDb = {
                ...data,
                typeOfVisit: activeTab,
                dueDate: combinedDateTime,
            };

            const result = await addVisitAction(customerId, dealId, visitDataForDb, user.name);
            if (result.success && result.visit) {
                toast({ title: "Activity Updated", description: "The new visit has been added to the activity log." });
                onVisitAdded(result.visit);
                form.reset();
            } else {
                 toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e) {
             toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setLoading(false);
        }
    }
    
    const DeliveryVisitTabContent = (
        <div className="space-y-6">
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
                                    name={`deliveryInstallations.${form.watch('deliveryInstallations')?.findIndex(d => d?.id === item.id)}.noOfPcs`}
                                    render={({ field }) => (
                                        <FormControl>
                                            <Input
                                                type="number"
                                                className="h-7 w-20"
                                                placeholder="Pcs"
                                                disabled={!form.watch('deliveryInstallations')?.some(v => v?.id === item.id)}
                                                onChange={(e) => {
                                                    const currentValues = form.getValues('deliveryInstallations') || [];
                                                    const itemIndex = currentValues.findIndex(v => v?.id === item.id);
                                                    if (itemIndex > -1 && currentValues[itemIndex]) {
                                                        const newValues = [...currentValues];
                                                        newValues[itemIndex] = { ...newValues[itemIndex]!, noOfPcs: e.target.value };
                                                        form.setValue('deliveryInstallations', newValues);
                                                    }
                                                }}
                                                value={form.getValues('deliveryInstallations')?.find(v => v?.id === item.id)?.noOfPcs || ''}
                                            />
                                        </FormControl>
                                    )}
                                />
                            )}
                        </div>
                    ))}
                    {form.watch('deliveryInstallations')?.some(v => v?.id === 'other') && (
                        <FormField control={form.control} name="otherDelivery" render={({ field }) => ( <FormControl><Input placeholder="Specify other" {...field} className="h-8" /></FormControl> )} />
                    )}
                </div>
                 {/* Sub-Delivery/Installation Column */}
                 {watchedDeliveryInstallations?.some(d => d?.id === 'blind-installation') && (
                     <div className="space-y-3">
                         <FormLabel className="font-semibold">Sub-Delivery/Installation</FormLabel>
                          {subDeliveryInstallationItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                                <FormField
                                    control={form.control}
                                    name="subDeliveryInstallations"
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
                                <FormField
                                    control={form.control}
                                    name={`subDeliveryInstallations.${form.watch('subDeliveryInstallations')?.findIndex(d => d?.id === item.id)}.noOfPcs`}
                                    render={({ field }) => (
                                        <FormControl>
                                            <Input
                                                type="number"
                                                className="h-7 w-20"
                                                placeholder="Pcs"
                                                disabled={!form.watch('subDeliveryInstallations')?.some(v => v?.id === item.id)}
                                                onChange={(e) => {
                                                    const currentValues = form.getValues('subDeliveryInstallations') || [];
                                                    const itemIndex = currentValues.findIndex(v => v?.id === item.id);
                                                    if (itemIndex > -1 && currentValues[itemIndex]) {
                                                        const newValues = [...currentValues];
                                                        newValues[itemIndex] = { ...newValues[itemIndex]!, noOfPcs: e.target.value };
                                                        form.setValue('subDeliveryInstallations', newValues, { shouldValidate: true });
                                                    }
                                                }}
                                                value={form.getValues('subDeliveryInstallations')?.find(v => v?.id === item.id)?.noOfPcs || ''}
                                            />
                                        </FormControl>
                                    )}
                                />
                            </div>
                         ))}
                     </div>
                )}
            </div>
        </div>
    );

    return (
         <Card className="mt-6">
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle>Add Visit</CardTitle>
                <Button variant="outline">Add Visit</Button>
            </CardHeader>
            <CardContent className="p-6">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="border rounded-lg">
                             <div className="flex">
                                <button type="button" onClick={() => setActiveTab('measurement')} className={`flex-1 p-3 font-semibold text-center ${activeTab === 'measurement' ? 'bg-primary text-primary-foreground rounded-tl-md' : 'bg-muted/50'}`}>Measurement Visit</button>
                                <Separator orientation="vertical" />
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button 
                                                type="button" 
                                                onClick={() => hasMeasurementVisit && setActiveTab('delivery')} 
                                                className={`flex-1 p-3 font-semibold text-center ${activeTab === 'delivery' ? 'bg-primary text-primary-foreground rounded-tr-md' : 'bg-muted/50'} disabled:cursor-not-allowed disabled:opacity-50`}
                                                disabled={!hasMeasurementVisit}
                                            >
                                                Delivery Visit
                                            </button>
                                        </TooltipTrigger>
                                        {!hasMeasurementVisit && (
                                            <TooltipContent>
                                                <p>A measurement visit must be completed before creating a delivery visit.</p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="representative"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Representative</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="All User" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                                                <Calendar className="mr-2 h-4 w-4" />
                                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                        <FormField
                                        control={form.control}
                                        name="time"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Time</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                {activeTab === 'measurement' ? (
                                    <>
                                        <div className="border rounded-lg p-4">
                                            <FormLabel className="mb-4 block font-semibold">Type Of Measurement</FormLabel>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name="measurements"
                                                    render={() => (
                                                        <FormItem className="space-y-3">
                                                            <FormLabel>Measurements</FormLabel>
                                                            {measurementItems.map((item) => (
                                                                <FormField
                                                                    key={item.id}
                                                                    control={form.control}
                                                                    name="measurements"
                                                                    render={({ field }) => {
                                                                        return (
                                                                            <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                                                <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                            </FormItem>
                                                                        )
                                                                    }}
                                                                />
                                                            ))}
                                                        </FormItem>
                                                    )}
                                                />
                                                <div className="space-y-4">
                                                    <p className="font-medium text-sm">Sub-Measurements</p>
                                                    {watchedMeasurements?.includes('blind-measurement') && (
                                                        <FormField
                                                            control={form.control}
                                                            name="blinds"
                                                            render={() => (
                                                                <FormItem className="space-y-3 pl-4">
                                                                    <FormLabel>Blinds</FormLabel>
                                                                    {subMeasurementBlinds.map((item) => (
                                                                        <FormField key={item.id} control={form.control} name="blinds"
                                                                            render={({ field }) => (
                                                                                <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                                                    <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                                </FormItem>
                                                                            )}
                                                                        />
                                                                    ))}
                                                                </FormItem>
                                                            )}
                                                        />
                                                    )}
                                                     {watchedMeasurements?.includes('curtain-measurement') && (
                                                        <FormField
                                                            control={form.control}
                                                            name="curtain"
                                                            render={() => (
                                                                <FormItem className="space-y-3 pl-4">
                                                                    <FormLabel>Curtain</FormLabel>
                                                                    {subMeasurementCurtain.map((item) => (
                                                                        <FormField key={item.id} control={form.control} name="curtain"
                                                                            render={({ field }) => (
                                                                                <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                                                    <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                                    {item.id === 'other' && form.watch('curtain')?.includes('other') && (
                                                                                        <FormField control={form.control} name="otherCurtain" render={({ field }) => ( <FormControl><Input {...field} className="h-7" /></FormControl> )} />
                                                                                    )}
                                                                                </FormItem>
                                                                            )}
                                                                        />
                                                                    ))}
                                                                </FormItem>
                                                            )}
                                                        />
                                                     )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        {DeliveryVisitTabContent}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-8 flex">
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                    </form>
                 </Form>
            </CardContent>
        </Card>
    )
}

function MeasurementForm({ onMeasurementAdded, customerId, dealId }: { onMeasurementAdded: (measurement: DealMeasurement) => void, customerId: string, dealId: string }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: {
            room: "",
            measurementReference: "",
            noOfUnits: "1",
            measurement: "",
            file: null,
        },
    });

    const onSubmit = async (data: MeasurementFormValues) => {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
            return;
        }
        setLoading(true);
        try {
            const result = await addMeasurementAction(customerId, dealId, data, user.name);
            if (result.success && result.measurement) {
                toast({ title: "Measurement Added", description: "The new measurement has been saved." });
                onMeasurementAdded(result.measurement);
                form.reset();
            } else {
                 toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card className="mt-6">
            <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-6">Add More Measurements</h3>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="room"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1">Room <span className="text-destructive">*</span><Info className="h-3 w-3" /><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
                                            <Combobox
                                                options={roomOptions}
                                                value={field.value}
                                                onSelect={field.onChange}
                                                placeholder="--SELECT--"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="noOfUnits"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>No of Units <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="file"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Upload file</FormLabel>
                                            <FormControl>
                                                <Input type="file" onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="measurementReference"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Measurement Reference <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="measurement"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Measurement <span className="text-destructive">* (Upto 2000 characters)</span></FormLabel>
                                            <div className="relative">
                                                <FormControl>
                                                    <Textarea rows={5} maxLength={2000} className="pr-10" {...field} />
                                                </FormControl>
                                                <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-muted-foreground"><Calculator className="h-4 w-4"/></Button>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                        <div className="mt-8 flex">
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

const salesDescriptionOptions = [{ value: "curtain", label: "Drawing Room Curtain" }, { value: "sofa", label: "Sofa Fabric" }];

const AddProductForm = ({ onAddProduct }: { onAddProduct: (data: ProductFormValues) => void }) => {
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const addProductForm = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            productCategory: '', collectionBrand: "", serialNo: "", salesDescription: "",
            quantity: "", remarks: "", room: "", noOfPcs: '1', info1: "", info2: "",
        },
    });

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) { setBcnOptions([]); return; }
        setIsSearching(true);
        try {
            const results = await searchStockByBcn(query);
            setBcnOptions(results.map(stock => ({ value: stock.bcn || stock.id, label: stock.bcn || stock.id, stockItem: stock })));
        } catch (error) {
            console.error("Error searching BCN:", error);
            toast({ variant: 'destructive', title: 'Search failed' });
        } finally {
            setIsSearching(false);
        }
    };
    
    const handleBcnSelect = (value: string) => {
        const selectedOption = bcnOptions.find(opt => opt.value === value);
        if (selectedOption) {
            const stockItem = selectedOption.stockItem;
            addProductForm.setValue('collectionBrand', stockItem.bcn || stockItem.id);
            const category = stockItem.category?.toLowerCase() || '';
            let productCategoryValue = '';
            
            const matchedOption = productTypeOptions.find(opt => category.includes(opt.value));
            if (matchedOption) {
                productCategoryValue = matchedOption.value;
            }

            addProductForm.setValue('productCategory', productCategoryValue);
            addProductForm.setValue('serialNo', stockItem.serialNo || '');
        }
    };

    const handleAddClick = () => {
        addProductForm.handleSubmit((data) => {
            onAddProduct({...data, id: new Date().toISOString() });
            addProductForm.reset({
                productCategory: '', collectionBrand: "", serialNo: "", salesDescription: "",
                quantity: "", remarks: "", room: "", noOfPcs: '1', info1: "", info2: "",
            });
        })();
    };

    return (
        <FormProvider {...addProductForm}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold">Add More Products</h3>
            </div>
            <Card className="mb-4 p-4">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField control={addProductForm.control} name="productCategory" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Product Category <Info className="h-3 w-3"/></FormLabel> <Combobox options={productTypeOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="collectionBrand" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Collection/Brand (BCN)* <span className="text-destructive">*</span><Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={bcnOptions} value={field.value} onSelect={handleBcnSelect} onSearch={handleBcnSearch} placeholder="Search by any part of BCN..." searchPlaceholder="Type to search BCN..." emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="serialNo" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Serial No <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} readOnly /></FormControl> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="salesDescription" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Sales Description <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={salesDescriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField control={addProductForm.control} name="quantity" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Quantity <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <div className="flex items-center"><FormControl><Input {...field}/></FormControl><Button type="button" variant="ghost" size="icon" className="ml-1"><Calculator className="h-5 w-5"/></Button></div> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="remarks" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Remarks <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="room" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Room <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="noOfPcs" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">No of Pcs <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                    </div>
                </div>
            </Card>
            <div className="mt-4">
                <Button type="button" onClick={handleAddClick} variant="outline">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Product to List
                </Button>
            </div>
        </FormProvider>
    );
};

function ProductForm({ initialProducts, customerId, dealId, onRefresh, deal, customer }: { initialProducts: DealProduct[], customerId: string, dealId: string, onRefresh: () => void, deal: Deal, customer: Customer }) {
    const [activityLoading, setActivityLoading] = useState(false);
    const { toast } = useToast();
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<DealProduct[]>([]);


    const form = useForm<ProductListFormValues>({
        resolver: zodResolver(productListSchema),
        defaultValues: { products: initialProducts || [] },
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "products"
    });

    useEffect(() => {
        form.reset({ products: initialProducts || [] });
    }, [initialProducts, form]);
    
    const handleRefresh = async () => {
        setIsRefreshing(true);
        onRefresh();
        // Add a small delay for user to perceive the refresh action
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsRefreshing(false);
    };

    const handleAddProduct = (productData: ProductFormValues) => {
        append(productData);
    };

    const handleUpdateActivity = async (data: ProductListFormValues) => {
        setActivityLoading(true);
        const result = await updateDealProducts(customerId, dealId, data.products);
        if (result.success) {
            toast({ title: "Activity Updated", description: "All product changes have been saved." });
        } else {
            toast({ variant: 'destructive', title: 'Save Failed', description: result.message });
        }
        setActivityLoading(false);
    }
    
    const handleQuotationClick = async () => {
        const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
        if (selectedIds.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Items Selected',
                description: 'Please select at least one item to convert to a quotation.'
            });
            return;
        }
    
        const selectedProducts = fields
            .filter(field => selectedIds.includes(field.id!))
            .map(field => field as DealProduct);
        
        const productsWithRate = await Promise.all(
            selectedProducts.map(async (product) => {
                const stockResults = await searchStockByBcn(product.collectionBrand);
                const stockItem = stockResults.find(s => s.bcn === product.collectionBrand);
                return {
                    ...product,
                    rate: stockItem?.mrp || 0, // Default to 0 if not found
                };
            })
        );
            
        setSelectedProductsForQuotation(productsWithRate);
        setIsQuotationDialogOpen(true);
    };
    
    const allRowsSelected = fields.length > 0 && Object.keys(selectedRows).length === fields.length;
    const handleSelectAll = (checked: boolean) => {
        const newSelectedRows: Record<string, boolean> = {};
        if (checked) {
            fields.forEach((field) => { newSelectedRows[field.id!] = true; });
        }
        setSelectedRows(newSelectedRows);
    };
    const handleRowSelect = (id: string, checked: boolean) => {
        setSelectedRows(prev => {
            const newSelection = { ...prev };
            if (checked) {
                newSelection[id] = true;
            } else {
                delete newSelection[id];
            }
            return newSelection;
        });
    };

    return (
        <FormProvider {...form}>
        <Card className="mt-6">
            <CardContent className="p-6">
                <AddProductForm onAddProduct={handleAddProduct}/>

                <Separator className="my-8" />
                
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">Previously Added Products</h3>
                     <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh
                    </Button>
                </div>
                <div className="mb-4">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                     <Checkbox
                                        checked={allRowsSelected}
                                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                        aria-label="Select all rows"
                                    />
                                </TableHead>
                                <TableHead>Modify</TableHead>
                                <TableHead>Collection / Brand</TableHead>
                                <TableHead>Serial No</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Room</TableHead>
                                <TableHead>No of Pcs</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Remarks</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.length > 0 ? fields.map((field, index) => (
                                <TableRow key={field.id} data-state={selectedRows[field.id!] && "selected"}>
                                    <TableCell>
                                         <Checkbox
                                            checked={!!selectedRows[field.id!]}
                                            onCheckedChange={(checked) => handleRowSelect(field.id!, !!checked)}
                                            aria-label={`Select row ${index + 1}`}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => {}}><Edit className="h-4 w-4 text-blue-600"/></Button>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                    </TableCell>
                                    <TableCell>{form.watch(`products.${index}.collectionBrand`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.serialNo`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.quantity`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.room`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.noOfPcs`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.salesDescription`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.remarks`)}</TableCell>
                                    <TableCell>Order Created</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center h-24">No products added yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex gap-2 mb-8">
                    <Button type="button" >Convert To Order</Button>
                    <Button type="button" onClick={handleQuotationClick}>Convert To Quotation</Button>
                </div>
                
                 <div className="mt-12 flex flex-col items-start gap-4">
                    <form onSubmit={form.handleSubmit(handleUpdateActivity)}>
                        <p className="text-sm text-destructive mb-2">Please click on Update Activity if you have updated any changes.</p>
                        <Button type="submit" disabled={activityLoading} className="bg-cyan-600 hover:bg-cyan-700">
                            {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Activity
                        </Button>
                    </form>
                </div>
            </CardContent>
        </Card>
        <CreateQuotationDialog 
            isOpen={isQuotationDialogOpen} 
            onClose={() => setIsQuotationDialogOpen(false)} 
            deal={deal}
            customer={customer}
            initialItems={selectedProductsForQuotation}
            onSuccess={onRefresh}
        />
        </FormProvider>
    )
}

function QuotationsTab({ customerId, dealId, deal, salesmen }: { customerId: string, dealId: string, deal: Deal, salesmen: User[] }) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }
    
    const handlePrint = (quotation: Quotation) => {
        const printWindow = window.open('', '_blank');
        const content = document.getElementById(`print-quotation-${quotation.id}`);
        if (printWindow && content) {
            const printDocument = printWindow.document;
            printDocument.write('<html><head><title>Print Quotation</title></head><body>');
            printDocument.write(content.innerHTML);
            printDocument.write('</body></html>');
            printDocument.close();
            // Use a timeout to ensure the content is fully loaded before printing
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };


    useEffect(() => {
        const fetchQuotations = async () => {
            setLoading(true);
            const data = await getQuotationsForDeal(customerId, dealId);
            setQuotations(data);
            setLoading(false);
        };
        fetchQuotations();
    }, [customerId, dealId]);

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <>
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Quotation Details</CardTitle>
                </CardHeader>
                <CardContent>
                    {quotations.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Quotation No</TableHead>
                                    <TableHead>Quotation Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Store</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {quotations.map((q, i) => (
                                    <TableRow key={q.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell className="font-medium flex items-center gap-2">
                                             <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => handlePrint(q)}>
                                                        <Printer className="mr-2 h-4 w-4"/> Print
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem><Copy className="mr-2 h-4 w-4"/> Office Copy Print</DropdownMenuItem>
                                                    <DropdownMenuItem><FileDown className="mr-2 h-4 w-4"/> Clone Quotation</DropdownMenuItem>
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${q.id}`}>
                                                            Convert to Order
                                                        </Link>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button variant="link" className="p-0 h-auto" onClick={() => setSelectedQuotation(q)}>
                                                {q.quotationNo}
                                            </Button>
                                            <div className="hidden">
                                                <div id={`print-quotation-${q.id}`}>
                                                    <PrintableQuotation values={q} />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{format(parseDate(q.date), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{q.customerName}</TableCell>
                                        <TableCell><Badge variant="secondary">{q.status}</Badge></TableCell>
                                        <TableCell className="text-right">{q.totalAmount.toFixed(2)}</TableCell>
                                        <TableCell>{q.store}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No quotations have been generated for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
            {selectedQuotation && (
                 <QuotationDetailDialog
                    isOpen={!!selectedQuotation}
                    onClose={() => setSelectedQuotation(null)}
                    quotation={selectedQuotation}
                    deal={deal}
                    salesmen={salesmen}
                />
            )}
        </>
    );
}

function OrdersTab({ customerId, dealId }: { customerId: string, dealId: string }) {
    const [orders, setOrders] = useState<DealOrder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            const data = await getOrdersForDeal(customerId, dealId);
            setOrders(data);
            setLoading(false);
        };
        fetchOrders();
    }, [customerId, dealId]);
    
    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
         <Card className="mt-6">
            <CardHeader>
                <CardTitle>Orders Details</CardTitle>
            </CardHeader>
            <CardContent>
                {orders.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Order No</TableHead>
                                <TableHead>Order Remark</TableHead>
                                <TableHead>Order Date</TableHead>
                                <TableHead>Created By</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.map((order, i) => (
                                <TableRow key={order.id}>
                                    <TableCell>{i + 1}</TableCell>
                                    <TableCell className="flex items-center gap-2">
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                        <Button variant="link" className="p-0 h-auto">{order.orderNo}</Button>
                                    </TableCell>
                                    <TableCell>{order.remark || '-'}</TableCell>
                                    <TableCell>{format(parseDate(order.orderDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{order.createdBy}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        No orders have been generated for this deal yet.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function VisitsTab({ customerId, dealId, salesmen, visits, onVisitAdded }: { customerId: string, dealId: string, salesmen: User[], visits: DealVisit[], onVisitAdded: (visit: DealVisit) => void }) {
    const [loading, setLoading] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

    const renderMeasurementDetails = (visit: DealVisit) => (
        <div className="space-y-2">
            <div>
                <h4 className="font-semibold">Measurements Selected:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {(visit.measurements && visit.measurements.length > 0) ? visit.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
                </ul>
            </div>
             {visit.blinds && visit.blinds.length > 0 && (
                <div>
                    <h4 className="font-semibold">Blind Types:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                        {visit.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                    </ul>
                </div>
            )}
             {visit.curtain && visit.curtain.length > 0 && (
                <div>
                    <h4 className="font-semibold">Curtain Types:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                       {visit.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                       {visit.otherCurtain && <li>Other: {visit.otherCurtain}</li>}
                    </ul>
                </div>
            )}
        </div>
    );

    const renderDeliveryDetails = (visit: DealVisit) => (
        <div className="space-y-2">
            <div>
                <h4 className="font-semibold">Delivery/Installation Selected:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {(visit.deliveryInstallations && visit.deliveryInstallations.length > 0) ? 
                        visit.deliveryInstallations.map(d => d && <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                        : <li>None</li>}
                    {visit.otherDelivery && <li>Other: {visit.otherDelivery}</li>}
                </ul>
            </div>
             {visit.subDeliveryInstallations && visit.subDeliveryInstallations.length > 0 && (
                <div>
                    <h4 className="font-semibold">Sub-Delivery/Installation:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                        {visit.subDeliveryInstallations.map(d => d && <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
                    </ul>
                </div>
            )}
        </div>
    );


    return (
        <div>
            <VisitForm salesmen={salesmen} customerId={customerId} dealId={dealId} onVisitAdded={onVisitAdded} visits={visits} />
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Visit History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : visits.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Representative</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visits.map((visit, i) => (
                                    <TableRow key={visit.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell className="capitalize">{visit.typeOfVisit}</TableCell>
                                        <TableCell>{format(new Date(visit.dueDate), 'PPP p')}</TableCell>
                                        <TableCell>{salesmen.find(s => s.id === visit.representative)?.name || visit.representative}</TableCell>
                                        <TableCell>{visit.createdBy}</TableCell>
                                        <TableCell>{format(new Date(visit.createdAt), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => setSelectedVisit(visit)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No visits have been logged for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
             {selectedVisit && (
                <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Visit Details</DialogTitle>
                            <DialogDescription>
                                Details for visit on {format(new Date(selectedVisit.dueDate), 'PPP p')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                           {selectedVisit.typeOfVisit === 'measurement'
                                ? renderMeasurementDetails(selectedVisit)
                                : renderDeliveryDetails(selectedVisit)}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function MeasurementsTab({ customerId, dealId }: { customerId: string; dealId: string }) {
    const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMeasurements = useCallback(async () => {
        setLoading(true);
        const data = await getMeasurementsForDeal(customerId, dealId);
        setMeasurements(data);
        setLoading(false);
    }, [customerId, dealId]);

    useEffect(() => {
        fetchMeasurements();
    }, [fetchMeasurements]);

    const handleMeasurementAdded = (newMeasurement: DealMeasurement) => {
        setMeasurements(prev => [newMeasurement, ...prev]);
    };

    return (
        <div>
            <MeasurementForm onMeasurementAdded={handleMeasurementAdded} customerId={customerId} dealId={dealId} />
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Measurement History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : measurements.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Units</TableHead>
                                    <TableHead>Measurement</TableHead>
                                    <TableHead>Attachment</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {measurements.map((m, i) => (
                                    <TableRow key={m.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell>{m.room}</TableCell>
                                        <TableCell>{m.measurementReference}</TableCell>
                                        <TableCell>{m.noOfUnits}</TableCell>
                                        <TableCell><p className="max-w-xs truncate">{m.measurement}</p></TableCell>
                                        <TableCell>
                                            {m.fileUrl && (
                                                <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                                                    <Image src={m.fileUrl} alt="Thumbnail" width={40} height={40} className="rounded-md object-cover" data-ai-hint="measurement document" />
                                                </a>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <p>{m.createdBy}</p>
                                                <p className="text-muted-foreground">{format(new Date(m.createdAt), 'dd/MM/yy')}</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No measurements have been logged for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function CrmActivitySkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-r p-6 hidden lg:block">
        <Skeleton className="h-6 w-3/4 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
          <Separator />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full mb-4" />
        <div className="text-center py-20">
          <Skeleton className="h-32 w-32 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-5 w-64 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default function CrmActivityTrackerPage({ params: paramsPromise }: { params: Promise<{ customerId: string, dealId: string }> }) {
  const params = use(paramsPromise);
  const { customerId, dealId } = params;
  const { toast } = useToast();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVisits = useCallback(async () => {
    const data = await getVisitsForDeal(customerId, dealId);
    setVisits(data);
  }, [customerId, dealId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customerData, dealData, salesmenData] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealId),
        getSalesmen(),
      ]);
      
      if (!customerData) throw new Error("Customer not found");
      if (!dealData) throw new Error("Deal not found");

      setCustomer(customerData);
      setDeal(dealData);
      setSalesmen(salesmenData);
      
    } catch (error) {
      console.error("Failed to fetch CRM activity data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Could not load activity data.",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId, toast]);

  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchData();
    fetchVisits();
  }, [customerId, dealId, fetchData, fetchVisits]);

  if (loading) {
    return <CrmActivitySkeleton />;
  }

  if (!customer || !deal) {
    return (
        <div className="flex items-center justify-center h-full">
            <Card className="m-4">
                <CardContent className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">Data not found</h2>
                    <p className="text-muted-foreground mb-4">The requested customer or deal could not be loaded.</p>
                    <Button asChild>
                        <Link href="/dashboard/customers">Back to Customers</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
  }

  const representative = salesmen.find(s => s.id === deal.representativeId);

  return (
    <div className="flex h-full bg-card">
      {/* Left Sidebar */}
      <aside className="w-[300px] flex-shrink-0 border-r p-6 space-y-6 hidden lg:block overflow-y-auto">
        <h2 className="text-lg font-semibold">CRM Activity Tracker</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Deal Name</p>
            <p className="font-semibold text-primary">{deal.dealName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deal Amount:</p>
            <p className="font-semibold">{deal.dealAmount.toFixed(2)}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">Deal Stage:</p>
            <p className="font-semibold">DEAL CREATED</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Store</p>
            <p className="font-semibold">{customer.state || 'MO GCR BRANCH'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Representative</p>
            <p className="font-semibold">{representative?.name || 'N/A'}</p>
          </div>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground">Contact Person</p>
            <p className="font-semibold">{customer.name}</p>
            <p className="text-sm text-muted-foreground">Mobile No: {customer.mobileNo}</p>
            <p className="text-sm text-muted-foreground">City: {customer.city || 'N/A'}</p>
          </div>
           <Separator />
            <div>
            <p className="text-xs text-muted-foreground">Deal Description:</p>
            <p className="text-sm">{deal.description || "No description provided."}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/customers/${customerId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Deals
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full bg-pink-500 hover:bg-pink-600 text-white">
            <Plane className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="visits">
          <TabsList className="mb-4">
            <TabsTrigger value="visits"><Home className="mr-2 h-4 w-4" />Visits</TabsTrigger>
            <TabsTrigger value="measurement"><GanttChartSquare className="mr-2 h-4 w-4"/>Measurement</TabsTrigger>
            <TabsTrigger value="cpd"><Contact2 className="mr-2 h-4 w-4" />CPD</TabsTrigger>
            <TabsTrigger value="products"><ShoppingCart className="mr-2 h-4 w-4"/>Products</TabsTrigger>
            <TabsTrigger value="reminder"><Calendar className="mr-2 h-4 w-4"/>Reminder/Notes</TabsTrigger>
            <TabsTrigger value="receipt"><Receipt className="mr-2 h-4 w-4"/>Receipt</TabsTrigger>
            <TabsTrigger value="vas"><Package className="mr-2 h-4 w-4"/>VAS</TabsTrigger>
            <TabsTrigger value="orders"><UserIcon className="mr-2 h-4 w-4"/>Orders</TabsTrigger>
            <TabsTrigger value="quotations"><MessageSquare className="mr-2 h-4 w-4"/>Quotations</TabsTrigger>
            <TabsTrigger value="invoice"><FileText className="mr-2 h-4 w-4"/>Invoice</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visits">
            <VisitsTab customerId={customerId} dealId={dealId} salesmen={salesmen} visits={visits} onVisitAdded={fetchVisits} />
          </TabsContent>
          
          <TabsContent value="measurement">
            <MeasurementsTab customerId={customerId} dealId={dealId} />
          </TabsContent>

          <TabsContent value="cpd">
            <CpdTab customer={customer} salesmen={salesmen} dealId={dealId} />
          </TabsContent>
          
          <TabsContent value="products">
            <ProductForm 
                initialProducts={deal.products || []}
                customerId={customerId}
                dealId={dealId}
                onRefresh={fetchData}
                deal={deal}
                customer={customer}
            />
          </TabsContent>

          <TabsContent value="quotations">
             <QuotationsTab customerId={customerId} dealId={dealId} deal={deal} salesmen={salesmen} />
          </TabsContent>

          <TabsContent value="orders">
             <OrdersTab customerId={customerId} dealId={dealId} />
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}

// CPD Tab Component
function CpdTab({ customer, salesmen, dealId }: { customer: Customer, salesmen: User[], dealId: string }) {
    const [cpds, setCpds] = useState<Cpd[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCpd, setSelectedCpd] = useState<Cpd | null>(null);

    const fetchCpds = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getCpdsForDeal(customer.id, dealId);
            setCpds(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [customer.id, dealId]);

    useEffect(() => {
        fetchCpds();
    }, [fetchCpds]);

    return (
        <div className="space-y-6">
            <CpdForm customer={customer} salesmen={salesmen} dealId={dealId} />
            <Card>
                <CardHeader>
                    <CardTitle>Saved CPDs</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-24 w-full" /> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>CPD ID</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Representative</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cpds.length > 0 ? cpds.map(cpd => (
                                    <TableRow key={cpd.id}>
                                        <TableCell>
                                            <Button variant="link" className="p-0" onClick={() => setSelectedCpd(cpd)}>
                                                {cpd.cpdId}
                                            </Button>
                                        </TableCell>
                                        <TableCell>{cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</TableCell>
                                        <TableCell>{cpd.createdBy}</TableCell>
                                        <TableCell>{salesmen.find(s => s.id === cpd.representative)?.name || 'N/A'}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">No CPDs saved for this deal yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            <Dialog open={!!selectedCpd} onOpenChange={() => setSelectedCpd(null)}>
                <DialogContent className="max-w-[800px] h-[90vh]">
                    {selectedCpd && <PrintableCpd cpd={selectedCpd} />}
                </DialogContent>
            </Dialog>
        </div>
    )
}

function PrintableCpd({ cpd }: { cpd: Cpd }) {
    return (
        <div className="p-4 bg-white text-black font-sans text-xs">
            <h1 className="text-2xl font-bold text-center mb-4">Customer Product Details</h1>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <p><strong>CPD No:</strong> {cpd.cpdId}</p>
                <p><strong>Date:</strong> {cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</p>
                <p><strong>Customer:</strong> {cpd.customerName}</p>
                <p><strong>Tel No:</strong> {cpd.telNo}</p>
            </div>
            <div className="space-y-4">
                {cpd.rooms.map((room, roomIndex) => (
                    <div key={roomIndex}>
                        <h3 className="font-bold bg-muted p-2 rounded-t-md">{room.room || 'General Items'}</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Dis%</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {room.items.map((item, itemIndex) => (
                                    <TableRow key={itemIndex}>
                                        <TableCell>{item.itemName}</TableCell>
                                        <TableCell>{item.type}</TableCell>
                                        <TableCell>{item.qty}</TableCell>
                                        <TableCell>{item.rate}</TableCell>
                                        <TableCell>{item.dis}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ))}
            </div>
        </div>
    )
}
