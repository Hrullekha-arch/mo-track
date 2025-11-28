import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
  } from "@/components/ui/select";
  
  export const PremiumSelect = ({ children, ...props }: any) => (
    <Select {...props}>
      <SelectTrigger className="premium-select">
        <SelectValue />
      </SelectTrigger>
  
      <SelectContent className="backdrop-blur-xl bg-white/70 rounded-xl border border-white/20 shadow-xl">
        {children}
      </SelectContent>
    </Select>
  );
  