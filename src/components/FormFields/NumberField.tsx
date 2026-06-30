import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  value?: number | string;
  placeholder?: string;
};

export default function NumberField({ label, value, placeholder }: Props) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" defaultValue={value} placeholder={placeholder} />
    </div>
  );
}
