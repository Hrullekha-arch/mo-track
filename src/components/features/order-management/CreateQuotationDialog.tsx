

"use client";

import { useState, useEffect, ReactNode, useMemo } from "react";
import { useForm, useFieldArray, useWatch, Control, UseFormReturn, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Customer, Deal, DealProduct, Quotation, VasDetail, Cpd, QuotationItem } from "@/lib/types";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Info, Calculator, Edit, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { createQuotationAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";


const roomOptions = [
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

const companyOptions = [{ value: "mo-design", label: "Mo Design" }];
const storeOptions = [{ value: "mo-gcr-branch", label: "MO GCR BRANCH" }];
const dealOptions = [{ value: "deal-1", label: "Deal 1" }, { value: "deal-2", label: "Deal 2" }];
const billingOptions = [{ value: "billing-1", label: "Billing 1" }];
const descriptionOptions = [{ value: "curtain", label: "Curtain" }, { value: "sofa-fabric", label: "Sofa Fabric" }];
const vasOptions = [
    { value: '22*22', label: '22*22' },
    { value: 'ac-fold-stitching-charges', label: 'AC FOLD STITCHING CHARGES' },
    { value: 'alteration-charges', label: 'ALTERATION CHARGES' },
    { value: 'bainding-charges', label: 'BAINDING CHARGES' },
    { value: 'balloon-curtain-stitching-charges', label: 'BALLOON CURTAIN STITCHING CHARGES' },
    { value: 'bedcover-stitchig-charges', label: 'BEDCOVER STITCHIG CHARGES' },
    { value: 'bedhead-stitching-charges', label: 'BEDHEAD STITCHING CHARGES' },
    { value: 'bedrunner-stitching-charges', label: 'BEDRUNNER STITCHING CHARGES' },
    { value: 'belt-stitching-charges', label: 'BELT STITCHING CHARGES' },
    { value: 'bench-stitching-charges', label: 'BENCH STITCHING CHARGES' },
    { value: 'bending-charge', label: 'BENDING CHARGE' },
    { value: 'blind-alteration-charges', label: 'BLIND ALTERATION CHARGES' },
    { value: 'blind-repairing-charges', label: 'BLIND REPAIRING CHARGES' },
    { value: 'blind-stitching-charges-reg', label: 'BLIND STITCHING CHARGES - REG' },
    { value: 'blind-with-border-stitching-charges', label: 'BLIND WITH BORDER STITCHING CHARGES' },
    { value: 'bolster-cover-stitching-charges', label: 'BOLSTER COVER STITCHING CHARGES' },
    { value: 'box-pleat-stitching-charges', label: 'BOX PLEAT STITCHING CHARGES' },
    { value: 'border-work', label: 'Border work' },
    { value: 'boxster-cover-stitching', label: 'Boxster Cover Stitching' },
    { value: 'carpet-laying-&-fixing-charges', label: 'CARPET LAYING & FIXING CHARGES' },
    { value: 'chair-stitching-charges', label: 'CHAIR STITCHING CHARGES' },
    { value: 'channel-baiding-charge', label: 'CHANNEL BAIDING CHARGE' },
    { value: 'channel-installation-charges', label: 'CHANNEL INSTALLATION CHARGES' },
    { value: 'channel-repairing-charges', label: 'CHANNEL REPAIRING CHARGES' },
    { value: 'couche-stitching-charges', label: 'COUCHE STITCHING CHARGES' },
    { value: 'curtain-alteration-charge', label: 'CURTAIN ALTERATION CHARGE' },
    { value: 'curtain-alteration-charges', label: 'CURTAIN ALTERATION CHARGES' },
    { value: 'curtain-stitching-charges', label: 'CURTAIN STITCHING CHARGES' },
    { value: 'cushion-cover-stitching-charges', label: 'CUSHION COVER STITCHING CHARGES' },
    { value: 'cylinder-pleat-stitching-charges', label: 'CYLINDER PLEAT STITCHING CHARGES' },
    { value: 'deewan', label: 'DEEWAN' },
    { value: 'deewan-stitching', label: 'DEEWAN STITCHING' },
    { value: 'double-height-three-plates', label: 'DOUBLE HEIGHT THREE PLATES' },
    { value: 'dining-chair-stitching', label: 'Dining Chair Stitching' },
    { value: 'eliza-tape-curtain-stitching', label: 'ELIZA TAPE CURTAIN STITCHING' },
    { value: 'eyelet-curtain-sttiching-charges', label: 'EYELET CURTAIN STTICHING CHARGES' },
    { value: 'eyelet-with-border-stitching', label: 'EYELET WITH BORDER STITCHING' },
    { value: 'fitted-bedsheet-stitching-charges', label: 'FITTED BEDSHEET STITCHING CHARGES' },
    { value: 'fitted-sheet-stitching-charges', label: 'FITTED SHEET STITCHING CHARGES' },
    { value: 'flooring-laying-&-fixing-charges', label: 'FLOORING LAYING & FIXING CHARGES' },
    { value: 'freight-charges-18%', label: 'FREIGHT CHARGES 18%' },
    { value: 'fringes-work', label: 'Fringes Work' },
    { value: 'goblet-stitching-charges', label: 'GOBLET STITCHING CHARGES' },
    { value: 'headen-tape-stitching-charges', label: 'HEADEN TAPE STITCHING CHARGES' },
    { value: 'installatation-charges', label: 'INSTALLATATION CHARGES' },
    { value: 'laying-&-fixing-charges', label: 'LAYING & FIXING CHARGES' },
    { value: 'loop-curtain-stitching', label: 'LOOP CURTAIN STITCHING' },
    { value: 'loose-cover-stitching-charges', label: 'LOOSE COVER STITCHING CHARGES' },
    { value: 'mattress-cover-stitching-charges', label: 'MATTRESS COVER STITCHING CHARGES' },
    { value: 'mok-curtain-stitching-charges', label: 'MOK CURTAIN STITCHING CHARGES' },
    { value: 'motorized-channel-installation-charges', label: 'MOTORIZED CHANNEL INSTALLATION CHARGES' },
    { value: 'nefa-curtain-stitching-charges', label: 'NEFA CURTAIN STITCHING CHARGES' },
    { value: 'old-blind-stitching', label: 'OLD BLIND STITCHING' },
    { value: 'old-carpet-removing-charges', label: 'OLD CARPET REMOVING CHARGES' },
    { value: 'old-curtain-stitching', label: 'OLD CURTAIN STITCHING' },
    { value: 'one-pleat-curtain', label: 'ONE PLEAT CURTAIN' },
    { value: 'pelmet-stitching-charges', label: 'PELMET STITCHING CHARGES' },
    { value: 'pencile-pleat-stitching', label: 'PENCILE PLEAT STITCHING' },
    { value: 'pillow-cover-stitching', label: 'PILLOW COVER STITCHING' },
    { value: 'pin-board-stitching-charges', label: 'PIN BOARD STITCHING CHARGES' },
    { value: 'plain-curtain-stitching', label: 'PLAIN CURTAIN STITCHING' },
    { value: 'pouf-stitching-charges', label: 'POUF STITCHING CHARGES' },
    { value: 'puffi-stitching-charge', label: 'PUFFI STITCHING CHARGE' },
    { value: 'quilt-cover-stitching', label: 'QUILT COVER STITCHING' },
    { value: 'ripple-pleat-stitching-charges', label: 'RIPPLE PLEAT STITCHING CHARGES' },
    { value: 'rod-pocket-stitching', label: 'ROD POCKET STITCHING' },
    { value: 'roman-blind-stitching-charge', label: 'ROMAN BLIND STITCHING CHARGE' },
    { value: 'setti-stitching-charges', label: 'SETTI STITCHING CHARGES' },
    { value: 'sofa-combed-stitching-charges', label: 'SOFA COMBED STITCHING CHARGES' },
    { value: 'sofa-cover-stitching-charges', label: 'SOFA COVER STITCHING CHARGES' },
    { value: 'sofa-cushion-stitching-charges', label: 'SOFA CUSHION STITCHING CHARGES' },
    { value: 'sofa-recliner-stitching-charges', label: 'SOFA RECLINER STITCHING CHARGES' },
    { value: 'sofa-stitching-charges', label: 'SOFA STITCHING CHARGES' },
    { value: 'stitching-charges', label: 'STITCHING CHARGES' },
    { value: 'stitching-matterial', label: 'STITCHING MATTERIAL' },
    { value: 'stool-stitching-charges', label: 'STOOL STITCHING CHARGES' },
    { value: 'table-cover-stitching-charges', label: 'TABLE COVER STITCHING CHARGES' },
    { value: 'table-mat-stitching-charges', label: 'TABLE MAT STITCHING CHARGES' },
    { value: 'table-runner-stitching-charges', label: 'TABLE RUNNER STITCHING CHARGES' },
    { value: 'three-pleat-stitching-sheer', label: 'THREE PLEAT STITCHING - SHEER' },
    { value: 'three-pleat-stitching-reg', label: 'THREE PLEAT STITCHING- REG' },
    { value: 'three-pleat-with-border', label: 'THREE PLEAT WITH BORDER' },
    { value: 'valance-stitching-charges', label: 'VALANCE STITCHING CHARGES' },
    { value: 'wall-panneling-charges', label: 'WALL PANNELING CHARGES' },
    { value: 'wire-curtain-stitching', label: 'WIRE CURTAIN STITCHING' },
    { value: 'wallpaper-laying-charges', label: 'Wallpaper Laying Charges' },
    { value: 'zigzag-curtain-stitching', label: 'ZIGZAG CURTAIN STITCHING' },
    { value: 'blind', label: 'blind' },
    { value: 'cushion-18*18', label: 'cushion 18*18' },
    { value: 'cushion-22*22', label: 'cushion 22*22' },
    { value: 'loose-material', label: 'loose material' },
    { value: 'three-pleat-old', label: 'three pleat old' },
    { value: 'two-pleat-stitching', label: 'two pleat stitching' }
];

const itemDetailSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string().min(1, "Collection/Brand is required"),
  serialNo: z.string().optional(),
  salesDescription: z.string().min(1, "Description is required"),
  quantity: z.preprocess(
    (val) => (typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0, "Quantity must be non-negative")
  ),
  rate: z.preprocess(
    (val) => (typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0, "Rate must be non-negative")
  ),
  subtotal: z.number().optional(),
  discountPercent: z.preprocess(
    (val) => (val === '' ? 0 : typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0).max(100).optional()
  ),
  discount: z.number().optional(),
  taxableAmt: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
  room: z.string().optional(),
  noOfPcs: z.string().optional(),
  remark: z.string().optional(),
  stitchingType: z.string().optional(),
});

const vasDetailSchema = z.object({
    vasName: z.string().min(1, "VAS name is required"),
    rate: z.string().min(1, "Rate is required"),
    quantity: z.string().min(1, "Quantity is required"),
    room: z.string().optional(),
    taxableAmt: z.number().optional(),
    cgst: z.number().optional(),
    sgst: z.number().optional(),
    igst: z.number().optional(),
});

const formSchema = z.object({
  company: z.string().optional(),
  store: z.string().min(1, "Store is required"),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  billingName: z.string().optional(),
  billingAddress: z.string().optional(),
  dealName: z.string().min(1, "Deal name is required"),
  selectedCpdId: z.string().optional(),
  items: z.array(itemDetailSchema),
  vasDetails: z.array(vasDetailSchema).optional(),
  sendEmail: z.boolean().default(false),
  sendSms: z.boolean().default(false),
});

export type FormValues = z.infer<typeof formSchema>;
interface ItemDetailValues extends DealProduct {
    rate?: number;
}


interface CreateQuotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deal: Deal;
  customer: Customer;
  initialItems: ItemDetailValues[];
  cpds: Cpd[];
}


const PreviouslySelectedItems = ({ control, setValue, getValues }: { control: Control<FormValues>, setValue: UseFormReturn<FormValues>['setValue'], getValues: UseFormReturn<FormValues>['getValues'] }) => {
    const { fields, remove } = useFieldArray({ control, name: "items" });
    
    const items = useWatch({ control, name: 'items' });

    useEffect(() => {
        items.forEach((item, index) => {
            const quantity = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const subtotal = quantity * rate;
            const discountPercent = Number(item.discountPercent) || 0;
            const discount = subtotal * (discountPercent / 100);
            const taxableAmt = subtotal - discount;

            // To avoid re-rendering loop, check if values are different before setting
            if (getValues(`items.${index}.taxableAmt`) !== taxableAmt) {
                setValue(`items.${index}.taxableAmt`, taxableAmt);
            }
        });
    }, [items, setValue, getValues]);

    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Previously Selected Items</h3>
             <div className="border rounded-md">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Rate</TableHead>
                            <TableHead>Discount %</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead className="w-10">Remark</TableHead>
                            <TableHead className="w-10">Details</TableHead>
                            <TableHead className="w-10">Delete</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                           <TableRow key={field.id}>
                             <TableCell>{index + 1}</TableCell>
                             <TableCell>
                                <p className="font-medium text-primary cursor-pointer hover:underline">{getValues(`items.${index}.collectionBrand`)}</p>
                                <FormField control={control} name={`items.${index}.salesDescription`} render={({ field }) => (
                                    <Combobox options={descriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" />
                                )} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.rate`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.discountPercent`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                             <TableCell>
                                <FormField control={control} name={`items.${index}.taxableAmt`} render={({ field }) => (<Input readOnly disabled value={Number(field.value || 0).toFixed(2)} />)} />
                            </TableCell>
                             <TableCell>
                                <FormField control={control} name={`items.${index}.room`} render={({ field }) => (<Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" />)} />
                            </TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" className="text-blue-500"><Edit className="h-4 w-4"/></Button></TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" className="text-blue-500"><PlusCircle className="h-4 w-4"/></Button></TableCell>
                            <TableCell><Button type="button" variant="destructive" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button></TableCell>
                           </TableRow>
                        ))}
                    </TableBody>
                 </Table>
             </div>
        </div>
    );
};
  
const VasForm = ({ control }: { control: Control<FormValues> }) => {
    const { fields, append, remove } = useFieldArray({ control, name: "vasDetails" });
    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Add VAS Details (Value Added Services)</h3>
            {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg flex items-end gap-4">
                    <FormField control={control} name={`vasDetails.${index}.vasName`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>VAS*</FormLabel><Combobox options={vasOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.rate`} render={({ field }) => (<FormItem><FormLabel>Rate*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.room`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Room</FormLabel><Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                </div>
            ))}
            <div className="flex gap-2">
                <Button type="button" variant="default" onClick={() => append({ vasName: '', quantity: '1', rate: '0', room: '' })}>Add</Button>
                <Button type="button" variant="outline" onClick={() => remove()}>Reset</Button>
            </div>
        </div>
    );
};

const QuotationPreview = ({ form, onBack, onSubmit, loading }: { form: UseFormReturn<FormValues>, onBack: () => void, onSubmit: () => void, loading: boolean }) => {
    const values = form.getValues();

    const calculatedItems = useMemo(() => {
        return values.items.map(item => {
            const quantity = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const subtotal = quantity * rate;
            const discountPercent = Number(item.discountPercent) || 0;
            const discount = subtotal * (discountPercent / 100);
            const taxableAmt = subtotal - discount;
            const cgst = taxableAmt * 0.025;
            const sgst = taxableAmt * 0.025;
            const igst = 0; // Assuming IGST is 0 for now
            return { ...item, discountPercent, subtotal, discount, taxableAmt, cgst, sgst, igst };
        });
    }, [values.items]);

    const vasWithCalculations = useMemo(() => {
        return (values.vasDetails || []).map(vas => {
            const quantity = Number(vas.quantity) || 0;
            const rate = Number(vas.rate) || 0;
            const taxableAmt = quantity * rate;
            const cgst = taxableAmt * 0.025;
            const sgst = taxableAmt * 0.025;
            const igst = 0;
            return { ...vas, taxableAmt, cgst, sgst, igst };
        });
    }, [values.vasDetails]);

    const totals = useMemo(() => {
        const itemTotals = calculatedItems.reduce((acc, item) => {
            acc.quantity += item.quantity;
            acc.subtotal += item.subtotal;
            acc.discount += item.discount;
            acc.taxableAmt += item.taxableAmt;
            acc.cgst += item.cgst;
            acc.sgst += item.sgst;
            acc.igst += item.igst;
            return acc;
        }, { quantity: 0, subtotal: 0, discount: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0 });

        const vasTotals = vasWithCalculations.reduce((acc, vas) => {
            acc.quantity += Number(vas.quantity);
            acc.taxableAmt += vas.taxableAmt;
            acc.cgst += vas.cgst;
            acc.sgst += vas.sgst;
            acc.igst += vas.igst;
            return acc;
        }, { quantity: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0 });

        const quotationAmount = itemTotals.taxableAmt + vasTotals.taxableAmt + itemTotals.cgst + vasTotals.cgst + itemTotals.sgst + vasTotals.sgst;

        return { itemTotals, vasTotals, quotationAmount };
    }, [calculatedItems, vasWithCalculations]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Confirm & Create Quotation</h2>
                <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
            </div>

            <div className="grid grid-cols-4 gap-x-8 gap-y-4 text-sm">
                <div className="space-y-1"><p className="text-muted-foreground">Company</p><p className="font-semibold">{values.company || 'MO DESIGNS PRIVATE LIMITED'}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Store</p><p className="font-semibold">{values.store}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Quotation Date</p><p className="font-semibold">{format(values.date, 'dd/MM/yyyy')}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Valid Till Date</p><p className="font-semibold">{values.validTillDate ? format(values.validTillDate, 'dd/MM/yyyy') : '-'}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Customer Name</p><p className="font-semibold">{values.customerName}</p></div>
                <div className="space-y-1"><p className="text-muted-foreground">Billing Name</p><p className="font-semibold">{values.billingName || values.customerName}</p></div>
                <div className="space-y-1 col-span-2"><p className="text-muted-foreground">Billing Address</p><p className="font-semibold">{values.billingAddress || '-'}</p></div>
            </div>
            
            {/* Item Details */}
            <div className="space-y-2">
                <h3 className="text-lg font-semibold">Item Details</h3>
                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Collection / Brand</TableHead>
                                <TableHead>Serial No</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Subtotal</TableHead>
                                <TableHead>Discount</TableHead>
                                <TableHead>Room</TableHead>
                                <TableHead>No of Pcs</TableHead>
                                <TableHead>Taxable Amt</TableHead>
                                <TableHead>CGST</TableHead>
                                <TableHead>SGST</TableHead>
                                <TableHead>IGST</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedItems.map((item, index) => (
                                <TableRow key={item.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{item.collectionBrand}</TableCell>
                                    <TableCell>{item.serialNo}</TableCell>
                                    <TableCell>{item.quantity.toFixed(2)}</TableCell>
                                    <TableCell>{item.rate.toFixed(2)}</TableCell>
                                    <TableCell>{item.subtotal.toFixed(2)}</TableCell>
                                    <TableCell>{item.discount.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@{item.discountPercent.toFixed(2)}%</span></TableCell>
                                    <TableCell>{item.room}</TableCell>
                                    <TableCell>{item.noOfPcs}</TableCell>
                                    <TableCell>{item.taxableAmt.toFixed(2)}</TableCell>
                                    <TableCell>{item.cgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.50%</span></TableCell>
                                    <TableCell>{item.sgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.50%</span></TableCell>
                                    <TableCell>{item.igst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@0.00%</span></TableCell>
                                    <TableCell>{item.salesDescription}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={3} className="font-bold text-right">Total</TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.quantity.toFixed(2)}</TableCell>
                                <TableCell></TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.subtotal.toFixed(2)}</TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.discount.toFixed(2)}</TableCell>
                                <TableCell colSpan={2}></TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.taxableAmt.toFixed(2)}</TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.cgst.toFixed(2)}</TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.sgst.toFixed(2)}</TableCell>
                                <TableCell className="font-bold">{totals.itemTotals.igst.toFixed(2)}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </div>

            {/* VAS Details */}
            {vasWithCalculations.length > 0 && (
                 <div className="space-y-2">
                    <h3 className="text-lg font-semibold">VAS Details (Value Added Services)</h3>
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Vas Name</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Taxable Amt</TableHead>
                                    <TableHead>CGST</TableHead>
                                    <TableHead>SGST</TableHead>
                                    <TableHead>IGST</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {vasWithCalculations.map((vas, index) => {
                                     const amount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
                                     const taxAmount = amount * 0.05; // Assuming 5% tax
                                     return (
                                        <TableRow key={`vas-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{vas.vasName}</TableCell>
                                            <TableCell>{vas.quantity}</TableCell>
                                            <TableCell>{vas.rate}</TableCell>
                                            <TableCell>{vas.room || '-'}</TableCell>
                                            <TableCell>{vas.taxableAmt.toFixed(2)}</TableCell>
                                            <TableCell>{vas.cgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.5%</span></TableCell>
                                            <TableCell>{vas.sgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.5%</span></TableCell>
                                            <TableCell>{vas.igst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@0.00%</span></TableCell>
                                        </TableRow>
                                     );
                                })}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={2} className="font-bold text-right">Total</TableCell>
                                    <TableCell className="font-bold">{totals.vasTotals.quantity.toFixed(2)}</TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                    <TableCell className="font-bold">{totals.vasTotals.taxableAmt.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.vasTotals.cgst.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.vasTotals.sgst.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.vasTotals.igst.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </div>
            )}
            
            <div className="flex justify-between items-center pt-4">
                <div className="flex items-center gap-8">
                    <p className="font-bold text-lg">Quotation Amount: {totals.quotationAmount.toFixed(2)}</p>
                    <FormField control={form.control} name="sendEmail" render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Send Email</FormLabel></FormItem>)} />
                    <FormField control={form.control} name="sendSms" render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Send SMS</FormLabel></FormItem>)} />
                </div>
                 <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button type="button" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Quotation
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Quotation</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Have you selected the correct CPD for reference? This cannot be changed after creation.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onSubmit}>Continue & Create</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
                 </div>
            </div>
        </div>
    )
}

export function CreateQuotationDialog({ isOpen, onClose, onSuccess, deal, customer, initialItems, cpds }: CreateQuotationDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      store: "mo-gcr-branch",
      company: 'MO DESIGNS PRIVATE LIMITED',
      date: new Date(),
      items: [],
      vasDetails: [],
    },
  });
  
  const handleCpdSelect = (cpdId: string) => {
    // Only set the ID for reference. Do not auto-populate.
    form.setValue("selectedCpdId", cpdId === "none" ? undefined : cpdId);
  };
  
  useEffect(() => {
    if (isOpen) {
      if (deal && customer) {
        const itemsForForm: any[] = initialItems.map(item => {
          const description = `${item.collectionBrand || ''} - ${item.salesDescription || ''}`.trim();
          return {
              id: item.id || item.collectionBrand,
              collectionBrand: item.collectionBrand || '',
              serialNo: item.serialNo || '',
              salesDescription: description,
              quantity: parseFloat(item.quantity) || 0,
              rate: item.rate || 0,
              discountPercent: 0,
              room: item.room || '',
              noOfPcs: item.noOfPcs || '1',
              remark: item.remarks || '',
              stitchingType: item.stitchingType || '',
          };
        });

        form.reset({
          store: "mo-gcr-branch",
          company: 'MO DESIGNS PRIVATE LIMITED',
          date: new Date(),
          validTillDate: undefined,
          customerName: customer.name,
          billingName: customer.name,
          billingAddress: customer.addressPinCode,
          dealName: deal.dealName,
          selectedCpdId: undefined,
          items: itemsForForm,
          vasDetails: [],
          sendEmail: false,
          sendSms: false,
        });
      }
      setView('edit'); 
    }
  }, [isOpen, deal, customer, initialItems, form]);


  async function createQuotation() {
    const values = form.getValues();
    if (!user) {
        toast({ variant: "destructive", title: "Not authenticated." });
        return;
    }

    const totalAmount = values.items.reduce((sum, item) => {
        const subtotal = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        const discount = subtotal * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmt = subtotal - discount;
        const tax = taxableAmt * 0.05; // 2.5% CGST + 2.5% SGST
        return sum + taxableAmt + tax;
    }, 0);

    const vasTotal = (values.vasDetails || []).reduce((sum, vas) => {
        const taxableAmt = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
        const tax = taxableAmt * 0.05;
        return sum + taxableAmt + tax;
    }, 0);

    setLoading(true);
    try {
        const quotationPayload = { ...values, cpdId: values.selectedCpdId, status: 'Pending Approval' };
        const result = await createQuotationAction(customer.id, deal.id, quotationPayload, totalAmount + vasTotal);

        if (result.success) {
            toast({ title: "Quotation Created", description: "The new quotation is now pending approval." });
            form.reset();
            onSuccess();
            onClose();
        } else {
             toast({ variant: "destructive", title: "Error", description: result.message });
        }
    } catch (error) {
      console.error("Error creating purchase request: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to create the quotation." });
    } finally {
      setLoading(false);
    }
  }

  const handleProceed = () => {
    form.trigger().then(isValid => {
      if(isValid) {
        setView('preview');
      } else {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fill in all required fields before proceeding.' });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {view === 'edit' ? 'Create Quotation' : ''}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-4">
        {view === 'edit' ? (
            <FormProvider {...form}>
            <form className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <FormField control={form.control} name="store" render={({ field }) => (<FormItem><FormLabel>Store*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="date" render={({ field }) => (<FormItem><FormLabel>Date*</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="validTillDate" render={({ field }) => (<FormItem><FormLabel>Valid Till Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="dealName" render={({ field }) => (<FormItem><FormLabel>Deal Name*</FormLabel><Combobox options={[{value: deal.dealName, label: deal.dealName}]} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                     <FormField
                        control={form.control}
                        name="selectedCpdId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Select CPD (for reference)</FormLabel>
                                <Select onValueChange={(value) => {
                                    field.onChange(value);
                                    handleCpdSelect(value);
                                }} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Load items from a CPD" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {cpds.map(cpd => <SelectItem key={cpd.id} value={cpd.id}>{cpd.cpdId}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormDescription>Selecting a CPD is for reference only.</FormDescription>
                            </FormItem>
                        )}
                    />
                </div>

                <Separator />
                
                <PreviouslySelectedItems control={form.control} setValue={form.setValue} getValues={form.getValues} />
                
                <Separator />

                <VasForm control={form.control} />
            </form>
            </FormProvider>
        ) : (
            <QuotationPreview form={form} onBack={() => setView('edit')} onSubmit={createQuotation} loading={loading} />
        )}
        </div>
        
        {view === 'edit' && (
             <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={handleProceed}>
                    Proceed to Preview
                </Button>
            </DialogFooter>
        )}

      </DialogContent>
    </Dialog>
  );
}
