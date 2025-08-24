

import { type Milestone, type OrderType, type PurchaseStep, O2DStep, type ComboboxOption } from './types';
import { ThumbsUp, Truck, FileCheck, Send, User, Users, Banknote, ClipboardCheck, Box, ArrowRightCircle, UserCheck, PackageSearch, MessageSquare, Briefcase, FileText, BadgePercent, Timer, ShoppingCart, PhoneCall, Factory, Layers, CheckCircle, Archive, Ruler, Weight, Barcode, Warehouse } from 'lucide-react';
import { addDays, addHours, addMinutes, subDays } from 'date-fns';
import { PurchaseRequest } from './types';


export const MILESTONES_CONFIG: Record<number, { name: string }> = {
  1: { name: 'Order Received' },
  2: { name: 'Fabric Allocated' },
  3: { name: 'Sent to Stitching' },
  4: { name: 'Stitching Done' },
  5: { name: 'Ready for Delivery' },
  6: { name: 'Installation Scheduled' },
  7: { name: 'Out for Delivery/Installation' },
  8: { name: 'Installation Done' },
};

export const ORDER_TYPE_MILESTONES: Record<OrderType, number[]> = {
  'delivery': [1, 2, 5, 7, 8],
  'stitching': [1, 2, 3, 4, 5, 7, 8],
  'stitching+installation': [1, 2, 3, 4, 5, 6, 7, 8],
};

export function getMilestonesForOrder(orderType: OrderType): Milestone[] {
  const milestoneIds = ORDER_TYPE_MILESTONES[orderType];
  return milestoneIds.map(id => ({
    id,
    name: MILESTONES_CONFIG[id].name,
    completed: false,
    completedBy: null,
    completedAt: null,
    location: null,
  }));
}

export const O2D_PROCESS_CONFIG: O2DStep[] = [
    { id: 1, step: "Receive Advance ₹1000", details: "For measurement/Fabric order", time: "30 min", role: "Salesman", icon: Banknote, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Measurement", details: "Coordinate with CRM for site visit", time: "1 Day", role: "CRM", icon: Users, expectedDuration: { days: 1 } },
    { id: 3, step: "Final Material Selection", details: "Finalize materials post-measurement", time: "7 Days", role: "System / Salesman", icon: UserCheck, expectedDuration: { days: 7 } },
    { id: 4, step: "Quotation Making", details: "Final quotation for the customer", time: "1 Day", role: "Salesman", icon: FileText, expectedDuration: { days: 1 } },
    { id: 5, step: "Quotation Re-check", details: "Verification of the quotation by accounts", time: "1 Hour", role: "Accounts", icon: ClipboardCheck, expectedDuration: { hours: 1 } },
    { id: 6, step: "Advance Receive For Order", details: "Receive advance payment for the main order", time: "Variable", role: "Accounts", icon: Banknote, expectedDuration: { days: 1 } },
    { id: 7, step: "Purchase Material Receiving", details: "Confirm all purchased materials have been received", time: "Variable", role: "System / PC", icon: PackageSearch, expectedDuration: { days: 7 } },
    { id: 8, step: "Production", details: "Production process begins", time: "Variable", role: "PC", icon: Factory, expectedDuration: { days: 5 } },
    { id: 9, step: "Full Kiting", details: "All items kitted for stitching/delivery", time: "1 Day", role: "PC", icon: Box, expectedDuration: { days: 1 } },
    { id: 10, step: "Balance Payment Follow Up", details: "Sales/CRM follows up for balance payment", time: "Variable", role: "Admin / Accounts", icon: PhoneCall, expectedDuration: { days: 1 } },
    { id: 11, step: "Payment Received Conf", details: "Accounts confirms final payment", time: "Variable", role: "System / Accounts", icon: CheckCircle, expectedDuration: { days: 1 } },
    { id: 12, step: "Installation/Delivery Schedule", details: "Schedule the final service", time: "1 Day", role: "PC", icon: Truck, expectedDuration: { days: 1 } },
    { id: 13, step: "Installation Done", details: "Final step in O2D, order moves to main board", time: "Variable", role: "Installer / System", icon: ThumbsUp, expectedDuration: { days: 2 } }
];

export const PURCHASE_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "Verify Authorization", details: "Authorization for purchase is confirmed", time: "10 min", role: "System", icon: ThumbsUp, expectedDuration: { minutes: 10 } },
    { id: 2, step: "Mark Payment Verification", details: "Payment status verified by accounts", time: "30 min", role: "Accounts", icon: CheckCircle, expectedDuration: { minutes: 30 } },
    { id: 3, step: "Vendor Type", details: "Select if vendor is new or existing", time: "5 min", role: "PC", icon: UserCheck, expectedDuration: { minutes: 5 } },
    { id: 4, step: "Place Order", details: "Generate and send PO to the vendor", time: "30 min", role: "PC", icon: Send, expectedDuration: { minutes: 30 } },
];


export const PO_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "PO Confirmation", details: "Confirm the Purchase Order with the vendor", time: "30 min", role: "PC", icon: FileCheck, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Delivery Follow Up", details: "Follow up on the delivery status", time: "T-2 Days", role: "PC", icon: Truck, expectedDuration: { days: -2 } }, // Special handling
    { id: 3, step: "Receiving And Sent To Location", details: "Receive materials and dispatch", time: "Delivery Time", role: "PC/Accounts", icon: Archive, expectedDuration: {} }, // Special handling
];

export const INBOUND_PROCESS_CONFIG = [
    { id: 1, name: 'QNQ as per PO', time: "30 min", icon: Ruler },
    { id: 2, name: 'Weight', time: "1hr", icon: Weight },
    { id: 3, name: 'Barcode', time: "1hr", icon: Barcode },
    { id: 4, name: 'Stock Update in Tally/CRM/Excel', time: "1hr", icon: CheckCircle },
    { id: 5, name: 'Assign Rack/Location', time: "Variable", icon: Warehouse },
];


export const roomOptions: ComboboxOption[] = [
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

export const vasOptions: ComboboxOption[] = [
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

export function getExpectedCompletionDate(step: O2DStep, startDate: Date): Date {
    const { days = 0, hours = 0, minutes = 0 } = step.expectedDuration;
    let completionDate = addDays(startDate, days);
    completionDate = addHours(completionDate, hours);
    completionDate = addMinutes(completionDate, minutes);
    return completionDate;
}

export const calculateExpectedDatesForOrder = (order: Pick<Order, 'createdAt' | 'o2dMilestones'>) => {
    const expectedDates: Record<number, Date> = {};

    O2D_PROCESS_CONFIG.forEach((currentStep, index) => {
        let startDate: Date;
        if (index === 0) {
            startDate = order.createdAt ? new Date(order.createdAt) : new Date();
        } else {
            const prevStepConfig = O2D_PROCESS_CONFIG[index - 1];
            const prevStepStatus = (order.o2dMilestones || []).find(m => m.stepId === prevStepConfig.id);

            if (prevStepStatus && (prevStepStatus.status === 'completed' || prevStepStatus.status === 'skipped')) {
                // If the previous step is done, the next one starts from its completion time.
                startDate = new Date(prevStepStatus.completedAt);
            } else {
                // If the previous step is not done, its start date is based on the one before it.
                // We reference the already calculated expected date for the previous step.
                startDate = expectedDates[prevStepConfig.id];
            }
        }
        expectedDates[currentStep.id] = getExpectedCompletionDate(currentStep, startDate);
    });

    return expectedDates;
}

export const calculateExpectedDatesForPO = (request: PurchaseRequest) => {
    return PO_PROCESS_CONFIG.reduce((acc, currentStep) => {
        let startDate: Date;
        if (currentStep.id === 1) {
             // PO process starts when the 'Place Order' step in the previous phase is completed.
            const placeOrderStep = request.milestones.find(m => m.stepId === 4);
            startDate = placeOrderStep ? new Date(placeOrderStep.completedAt) : new Date();
        } else {
            const previousStepConfig = PO_PROCESS_CONFIG.find(s => s.id === currentStep.id - 1)!;
            
            // Check for actual completed milestones to base the next step on
            const allPreviousMilestones = (request.poMilestones || []).filter(m => m.stepId < currentStep.id);
            const latestPreviousMilestone = allPreviousMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.createdAt).getTime())[0];

            if (latestPreviousMilestone) {
                startDate = new Date(latestPreviousMilestone.completedAt);
            } else {
                startDate = acc[previousStepConfig.id];
            }
        }
        
        // Dynamic date calculation based on vendor's promised date
        if (request.poDeliveryDate) {
            if (currentStep.id === 2) { // Material Delivery Follow up is 2 days before promised date
                acc[currentStep.id] = subDays(new Date(request.poDeliveryDate), 2);
                return acc;
            } else if (currentStep.id === 3) { // Receiving and Handover is on the promised date
                acc[currentStep.id] = new Date(request.poDeliveryDate);
                return acc;
            }
        }
        
        // Fallback to standard duration calculation
        const { days = 0, hours = 0, minutes = 0 } = currentStep.expectedDuration;
        let completionDate = addDays(startDate, days);
        completionDate = addHours(completionDate, hours);
        completionDate = addMinutes(completionDate, minutes);
        acc[currentStep.id] = completionDate;

        return acc;
    }, {} as Record<number, Date>);
}
    

    


