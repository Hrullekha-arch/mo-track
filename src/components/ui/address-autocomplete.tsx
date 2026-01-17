
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useDebounce } from "use-debounce";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface Prediction {
  description: string;
  place_id: string;
}

export interface PlaceDetails {
    address: string;
    city: string | null;
    state: string | null;
    postalCode: string | null;
}


interface AddressAutocompleteProps {
  onPlaceSelect: (details: PlaceDetails) => void;
}

export function AddressAutocomplete({ onPlaceSelect }: AddressAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [debouncedInputValue] = useDebounce(inputValue, 500);
  const [predictions, setPredictions] = React.useState<Prediction[]>([]);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (debouncedInputValue.length > 2) {
      const fetchPredictions = async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/places/autocomplete?input=${debouncedInputValue}`);
          const data = await response.json();
          if (data.predictions) {
            setPredictions(data.predictions);
          }
        } catch (error) {
          toast({ variant: "destructive", title: "Error fetching addresses" });
        } finally {
          setLoading(false);
        }
      };
      fetchPredictions();
    } else {
      setPredictions([]);
    }
  }, [debouncedInputValue, toast]);

  const handleSelect = async (placeId: string, description: string) => {
    setInputValue(description);
    setOpen(false);

    try {
        const response = await fetch(`/api/places/details?place_id=${placeId}`);
        const data = await response.json();
        
        if (data.result) {
            const addressComponents = data.result.address_components;
            const getComponent = (type: string) => addressComponents.find((c: any) => c.types.includes(type))?.long_name || null;
            
            const details: PlaceDetails = {
                address: data.result.formatted_address,
                city: getComponent("locality"),
                state: getComponent("administrative_area_level_1"),
                postalCode: getComponent("postal_code"),
            };
            onPlaceSelect(details);
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error fetching place details" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {inputValue || "Start typing an address..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search address..." onValueChange={setInputValue} />
          <CommandList>
            {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin"/>
                </div>
            ) : predictions.length > 0 ? (
              <CommandGroup>
                {predictions.map((p) => (
                  <CommandItem key={p.place_id} value={p.description} onSelect={() => handleSelect(p.place_id, p.description)}>
                    {p.description}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>
                {debouncedInputValue.length > 2 ? "No results found." : "Type at least 3 characters."}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
