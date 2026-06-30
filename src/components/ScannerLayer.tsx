"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ScanLine, Users, Wrench, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MachineResource, PersonResource, RoutingStep } from "@/types";

type Props = {
  knownOrders: Array<{
    orderId: string;
    barcode: string;
    orderNo: string;
    customerName: string;
    product: string;
  }>;
  people: PersonResource[];
  machines: MachineResource[];
  routes: RoutingStep[];
};

export default function ScannerLayer({ knownOrders, people, machines, routes }: Props) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");

  const barcodeMap = useMemo(
    () => new Map(knownOrders.map((order) => [order.barcode, order])),
    [knownOrders]
  );
  const activeOrder = useMemo(() => barcodeMap.get(value.trim()) || null, [barcodeMap, value]);

  const handleParse = () => {
    if (!value.trim()) {
      setMessage("Enter a barcode value first.");
      return;
    }

    if (barcodeMap.has(value.trim())) {
      setMessage(`Barcode ${value.trim()} matched. Select employee, helper, machine, and routing stage below.`);
      return;
    }

    setMessage(`Barcode ${value.trim()} is not present in the current queue.`);
  };

  const handleMount = () => {
    if (!activeOrder) {
      setMessage("Scan a valid barcode first.");
      return;
    }

    if (!selectedPerson || !selectedMachine || !selectedRoute) {
      setMessage("Select employee, machine, and routing stage before mounting the job.");
      return;
    }

    setMessage(
      `Mounted ${activeOrder.orderNo} to ${selectedPerson}${selectedHelper ? ` with helper ${selectedHelper}` : ""}, machine ${selectedMachine}, and route ${selectedRoute}.`
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scanner Layer
          </CardTitle>
          <CardDescription>
            Scan barcode first. After matching, choose the employee, helper, machine, and routing option to start the job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Scan or type barcode value"
          />
          <Button onClick={handleParse}>Parse Barcode</Button>
          {message ? <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{message}</div> : null}
          {activeOrder ? (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{activeOrder.orderNo}</div>
              <div className="mt-1 text-sm text-slate-600">
                {activeOrder.customerName} - {activeOrder.product}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Barcode Based Mount Options</CardTitle>
          <CardDescription>
            These options show only after barcode matching and help start the workshop process correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectBox
            icon={<Users className="h-4 w-4" />}
            label="Employee Option"
            value={selectedPerson}
            onChange={setSelectedPerson}
            options={people.map((person) => ({
              value: person.id,
              label: `${person.name} - ${person.role}`,
            }))}
          />
          <SelectBox
            icon={<Users className="h-4 w-4" />}
            label="Helper Option"
            value={selectedHelper}
            onChange={setSelectedHelper}
            options={people.map((person) => ({
              value: person.id,
              label: `${person.name} - ${person.helperType || person.role}`,
            }))}
          />
          <SelectBox
            icon={<Wrench className="h-4 w-4" />}
            label="Machine Option"
            value={selectedMachine}
            onChange={setSelectedMachine}
            options={machines.map((machine) => ({
              value: machine.id,
              label: `${machine.name} - ${machine.process}`,
            }))}
          />
          <SelectBox
            icon={<Route className="h-4 w-4" />}
            label="Routing Option"
            value={selectedRoute}
            onChange={setSelectedRoute}
            options={routes.map((route) => ({
              value: route.id,
              label: `Step ${route.stepNo} - ${route.stageName}`,
            }))}
          />
          <Button onClick={handleMount}>Start Barcode Based Job</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SelectBox({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        {icon}
        {label}
      </div>
      <select
        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
