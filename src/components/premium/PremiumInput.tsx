import { Input } from "@/components/ui/input";

export const PremiumInput = ({ className = "", ...props }: any) => (
  <Input {...props} className={`premium-input ${className}`} />
);
