export const PMS_SECTION_CARD_CLASS = "border-slate-200/90 shadow-sm";

export const PMS_CARD_HEADER_CLASS = "border-b border-slate-200/80 bg-slate-50/75 px-4 py-3";

export const PMS_CARD_TITLE_CLASS = "text-slate-900";

export const PMS_CARD_DESCRIPTION_CLASS = "text-xs sm:text-sm text-slate-500";

export const PMS_TABLE_HEADER_ROW_CLASS = "bg-slate-50/85";

export const PMS_TABLE_HEAD_CLASS = "text-[13px] font-semibold tracking-[0.01em] text-slate-600";

export const PMS_METRIC_CARD_STYLES = {
  products: {
    card: "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white",
    icon: "text-sky-600",
    title: "text-sky-900",
    value: "text-sky-950",
    meta: "text-sky-700/80",
  },
  machines: {
    card: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white",
    icon: "text-emerald-600",
    title: "text-emerald-900",
    value: "text-emerald-950",
    meta: "text-emerald-700/80",
  },
  capacity: {
    card: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white",
    icon: "text-amber-600",
    title: "text-amber-900",
    value: "text-amber-950",
    meta: "text-amber-700/80",
  },
  workforce: {
    card: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white",
    icon: "text-violet-600",
    title: "text-violet-900",
    value: "text-violet-950",
    meta: "text-violet-700/80",
  },
} as const;
