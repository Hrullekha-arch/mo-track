import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import * as React from "react";

export function SofaExtraDialog({ open, onClose, onAdd, initialData }: any) {
  const [type, setType] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<any>({});

  /* ===============================
     PREFILL WHEN EDITING
  =============================== */
  React.useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      const { type, ...rest } = initialData;
      setValues(rest);
    }
  }, [initialData]);

  const reset = () => {
    setType(null);
    setValues({});
  };

  const handleSave = () => {
    if (!type) return;
    onAdd({ type, ...values });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit Sofa Extra" : "Add Sofa Extra"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: TYPE SELECTION */}
        {!type && (
          <div className="grid grid-cols-2 gap-3">
            {["foam", "casement", "niwar", "marking"].map((t) => (
              <Button key={t} onClick={() => setType(t)}>
                {t.toUpperCase()}
              </Button>
            ))}
          </div>
        )}

        {/* STEP 2: FOAM */}
        {type === "foam" && (
          <div className="space-y-2">
            <Select
              value={values.size}
              onValueChange={(value) =>
                setValues({ ...values, size: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="72*35*4">72 × 35 × 4 "</SelectItem>
                <SelectItem value="72*35*3">72 × 35 × 3 "</SelectItem>
                <SelectItem value="72*35*2">72 × 35 × 2 "</SelectItem>
                <SelectItem value="72*35*1">72 × 35 × 1 "</SelectItem>
                <SelectItem value="72*35*0.5">72 × 35 × 1/2 "</SelectItem>
                <SelectItem value="21*22*4">21 × 22 × 4 "</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Density"
              value={values.density || ""}
              onChange={(e) =>
                setValues({ ...values, density: e.target.value })
              }
            />

            <Input
              placeholder="Qty"
              value={values.qty || ""}
              onChange={(e) =>
                setValues({ ...values, qty: e.target.value })
              }
            />

            {/* ACTIONS */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="w-1/2">
                ⬅ Back
              </Button>
              <Button onClick={handleSave} className="w-1/2">
                💾 Save
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: OTHER TYPES */}
        {type && type !== "foam" && (
          <div className="space-y-2">
            <Input
              placeholder="Qty"
              value={values.qty || ""}
              onChange={(e) =>
                setValues({ ...values, qty: e.target.value })
              }
            />

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="w-1/2">
                ⬅ Back
              </Button>
              <Button onClick={handleSave} className="w-1/2">
                💾 Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
