import { Milestone, Scissors, Package, Users, Wind, Check, Scan, Ruler, Box, Tag, Award, Waves, Layers, Printer, X, GanttChartSquare, ChevronDown, CheckCircle, Barcode } from 'lucide-react';

export const PMS_PROCESS_CONFIG = [
    { id: 1, step: "Roll & Fabric Allocation", time: "15 min", icon: Milestone },
    { id: 2, step: "Fabric Cutting", time: "2 hr", icon: Scissors },
    { id: 3, step: "Material Full Kitting", time: "15 min", icon: Package },
    { id: 4, step: "Allocate To Tailors", time: "3 min", icon: Users },
    { id: 5, step: "Stitch panels together", time: "15 min", icon: Layers },
    { id: 6, step: "Over lock & Ironing", time: "15 min", icon: Wind },
    { id: 7, step: "Stitching Head", time: "15 min", icon: Check },
    { id: 8, step: "Sizing", time: "10 min", icon: Ruler },
    { id: 9, step: "Bottom & Pleating", time: "15 min", icon: Scan },
    { id: 10, step: "Pleating/Rings/Eyelets", time: "15 min", icon: Box },
    { id: 11, step: "Ironing", time: "5 min", icon: Waves },
    { id: 12, step: "Q&Q", time: "15 min", icon: Award },
    { id: 13, step: "Packing & Labelling", time: "8 min", icon: Tag },
];
