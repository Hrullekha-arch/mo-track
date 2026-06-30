import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  value?: string;
  placeholder?: string;
  readOnly?: boolean;
  extra?: ReactNode;
};

export default function TextField({ label, value, placeholder, readOnly, extra }: Props) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input defaultValue={value} placeholder={placeholder} readOnly={readOnly} />
      {extra}
    </div>
  );
}
