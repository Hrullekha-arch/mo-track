import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  value?: string;
  placeholder?: string;
};

export default function TextAreaField({ label, value, placeholder }: Props) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea defaultValue={value} placeholder={placeholder} />
    </div>
  );
}
