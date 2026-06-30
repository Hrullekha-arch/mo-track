"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { saveMeasurementToDeal } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Loader2 } from "lucide-react";
import { DealMeasurement } from "@/lib/types";

const measurementSchema = z.object({
  room: z.string().min(1, "Room is required."),
  measurementReference: z.string().min(1, "Measurement reference is required."),
  noOfUnits: z.string().min(1, "Number of units is required."),
  measurement: z.string().min(1, "Measurement is required."),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

type MeasurementFormProps = {
  customerId: string;
  dealId: string;
  onMeasurementAdded?: (measurement: DealMeasurement) => void;
  onRefresh?: () => void;
};

export function MeasurementForm({
  onMeasurementAdded,
  onRefresh,
  customerId,
  dealId,
}: MeasurementFormProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<MeasurementFormValues>({
    resolver: zodResolver(measurementSchema),
    defaultValues: {
      room: "",
      measurementReference: "",
      noOfUnits: "1",
      measurement: "",
    },
  });

  const onSubmit = async (data: MeasurementFormValues) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await saveMeasurementToDeal({
        customerId,
        dealId,
        createdBy: user.name || user.email || "System",
        doerName: user.name || user.email || "System",
        typeOf: data.measurementReference,
        itemDetails: [],
        rooms: [
          {
            roomName: data.room,
            items: [
              {
                type: data.measurementReference,
                remark: data.measurement,
                data: {
                  noOfUnits: data.noOfUnits,
                  notes: data.measurement,
                },
                photos: [],
              },
            ],
          },
        ],
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save measurement.");
      }

      const savedMeasurement: DealMeasurement = {
        id: result.measurementId || crypto.randomUUID(),
        selectionId: undefined,
        typeOf: data.measurementReference,
        doerName: user.name || user.email || "System",
        entries: [],
        createdAt: new Date().toISOString(),
        createdBy: user.name || user.email || "System",
        pdfUrl: "",
        rooms: [
          {
            roomName: data.room,
            items: [],
          },
        ],
        status: "completed",
      };

      onMeasurementAdded?.(savedMeasurement);
      onRefresh?.();
      form.reset();

      toast({
        title: "Measurement Added",
        description: "The measurement has been saved.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardContent className="p-6">
        <h3 className="mb-6 text-xl font-semibold">Add More Measurements</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room</FormLabel>
                    <FormControl>
                      <Input placeholder="Living room" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="measurementReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <FormControl>
                      <Input placeholder="Window / Bed / Curtain" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="noOfUnits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. of Units</FormLabel>
                    <FormControl>
                      <Input placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="measurement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Measurement Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Enter measurement notes, dimensions, or installer remarks..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
