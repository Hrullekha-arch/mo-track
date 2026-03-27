

import { type Milestone, type OrderType, type PurchaseStep, O2DStep, type ComboboxOption, type Order } from './types';
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

export const storeOptions: ComboboxOption[] = [
    { value: "MO GCR BRANCH", label: "MO GCR BRANCH" },
    { value: "MO MG ROAD", label: "MO MG ROAD" },
    { value: "MO SULTANPUR", label: "MO SULTANPUR" },
];

export const ROOMS_NAME = [
  { label: "Living Room", value: "living_room" },
  { label: "Drawing Room", value: "drawing_room" },
  { label: "Family Room", value: "family_room" },
  { label: "Lounge", value: "lounge" },
  { label: "Sitting Room", value: "sitting_room" },
  { label: "Master Bedroom", value: "master_bedroom" },
  { label: "Bedroom-1", value: "bedroom_1" },
  { label: "Bedroom-2", value: "bedroom_2" },
  { label: "Bedroom-3", value: "bedroom_3" },
  { label: "Bedroom-4", value: "bedroom_4" },
  { label: "Guest Room", value: "guest_room" },
  { label: "Kids Room", value: "kids_room" },
  { label: "Baby Room / Nursery", value: "baby_room" },
  { label: "Son's Room", value: "sons_room" },
  { label: "Daughter's Room", value: "daughters_room" },
  { label: "Boy's Room", value: "boys_room" },
  { label: "Girl's Room", value: "girls_room" },
  { label: "Elder Son's Room", value: "elder_sons_room" },
  { label: "Elder Daughter's Room", value: "elder_daughters_room" },
  { label: "Younger Son's Room", value: "younger_sons_room" },
  { label: "Younger Daughter's Room", value: "younger_daughters_room" },
  { label: "In-Law's Room", value: "inlaws_room" },
  { label: "Grandparent's Room", value: "grandparents_room" },
  { label: "Staff Room", value: "staff_room" },
  { label: "Servant Room", value: "servant_room" },
  { label: "Dining Room", value: "dining_room" },
  { label: "Breakfast Nook", value: "breakfast_nook" },
  { label: "Kitchen", value: "kitchen" },
  { label: "Modular Kitchen", value: "modular_kitchen" },
  { label: "Open Kitchen", value: "open_kitchen" },
  { label: "Pantry", value: "pantry" },
  { label: "Dry Kitchen", value: "dry_kitchen" },
  { label: "Master Bathroom", value: "master_bathroom" },
  { label: "Bathroom-1", value: "bathroom_1" },
  { label: "Bathroom-2", value: "bathroom_2" },
  { label: "Bathroom-3", value: "bathroom_3" },
  { label: "Bathroom-4", value: "bathroom_4" },
  { label: "Guest Bathroom", value: "guest_bathroom" },
  { label: "Common Bathroom", value: "common_bathroom" },
  { label: "Powder Room", value: "powder_room" },
  { label: "Washroom", value: "washroom" },
  { label: "Home Office", value: "home_office" },
  { label: "Study Room", value: "study_room" },
  { label: "Library", value: "library" },
  { label: "Reading Room", value: "reading_room" },
  { label: "Studio", value: "studio" },
  { label: "Home Theatre", value: "home_theatre" },
  { label: "Game Room", value: "game_room" },
  { label: "Play Room", value: "play_room" },
  { label: "Gym / Fitness Room", value: "gym_room" },
  { label: "Yoga Room", value: "yoga_room" },
  { label: "Meditation Room", value: "meditation_room" },
  { label: "Music Room", value: "music_room" },
  { label: "Art Room / Craft Room", value: "art_room" },
  { label: "Bar / Lounge Room", value: "bar_room" },
  { label: "Pooja Room", value: "pooja_room" },
  { label: "Temple Room", value: "temple_room" },
  { label: "Prayer Room", value: "prayer_room" },
  { label: "Balcony-1", value: "balcony_1" },
  { label: "Balcony-2", value: "balcony_2" },
  { label: "Balcony-3", value: "balcony_3" },
  { label: "Balcony-4", value: "balcony_4" },
  { label: "Terrace", value: "terrace" },
  { label: "Rooftop", value: "rooftop" },
  { label: "Garden", value: "garden" },
  { label: "Backyard", value: "backyard" },
  { label: "Front Yard", value: "front_yard" },
  { label: "Courtyard", value: "courtyard" },
  { label: "Patio", value: "patio" },
  { label: "Verandah", value: "verandah" },
  { label: "Sit-out", value: "sit_out" },
  { label: "Deck", value: "deck" },
  { label: "Pergola Area", value: "pergola_area" },
  { label: "Laundry Room", value: "laundry_room" },
  { label: "Utility Room", value: "utility_room" },
  { label: "Store Room", value: "store_room" },
  { label: "Walk-in Closet", value: "walk_in_closet" },
  { label: "Wardrobe Room", value: "wardrobe_room" },
  { label: "Linen Closet", value: "linen_closet" },
  { label: "Mud Room", value: "mud_room" },
  { label: "Garage", value: "garage" },
  { label: "Parking Area", value: "parking_area" },
  { label: "Basement", value: "basement" },
  { label: "Attic", value: "attic" },
  { label: "Foyer / Entrance", value: "foyer" },
  { label: "Hallway", value: "hallway" },
  { label: "Corridor", value: "corridor" },
  { label: "Staircase Area", value: "staircase_area" },
  { label: "Lobby", value: "lobby" },
  { label: "Guest Suite", value: "guest_suite" },
  { label: "Multi-Purpose Room", value: "multi_purpose_room" },
  { label: "Other", value: "other" },
] as const;

export type RoomValue = (typeof ROOMS_NAME)[number]["value"];
export type RoomLabel = (typeof ROOMS_NAME)[number]["label"];

export const roomOptions: ComboboxOption[] = ROOMS_NAME.map((room) => ({
  value: room.value,
  label: room.label,
}));

export const vasOptions: ComboboxOption[] = [
      { value: 'stitching', label: 'STITCHING' },
      { value: 'installation', label: 'INSTALLATION' },
      { value: 'alteration', label: 'ALTERATION' },
      { value: 'laying', label: 'LAYING' },
      { value: 'removing', label: 'REMOVING' },
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

export const calculateExpectedDatesForOrder = (
    order: Pick<Order, 'createdAt'> & { o2dMilestones?: Order['o2dMilestones'] }
) => {
    const expectedDates: Record<number, Date> = {};
    let lastCompletionDate = order.createdAt ? new Date(order.createdAt) : new Date();

    O2D_PROCESS_CONFIG.forEach((currentStep) => {
        const milestone = (order.o2dMilestones || []).find(m => m.stepId === currentStep.id);
        
        // If the step is completed, its completion date is the new baseline for subsequent calculations
        if (milestone?.status === 'completed' || milestone?.status === 'skipped') {
            lastCompletionDate = new Date(milestone.completedAt);
        }
        
        // Calculate the expected date for the current step based on the last known completion date
        expectedDates[currentStep.id] = getExpectedCompletionDate(currentStep, lastCompletionDate);
    });

    return expectedDates;
};

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
            const latestPreviousMilestone = allPreviousMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];

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
    

    
