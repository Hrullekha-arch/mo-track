
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { addWalkinCustomer } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const formSchema = z.object({
  firstName: z.string().min(1, "First Name is required."),
  familyName: z.string().min(1, "Family Name is required."),
  mobile: z.string().min(10, "A valid mobile number is required.").max(15),
  customerType: z.string().min(1, "Customer Type is required."),
  email: z.string().email("Please enter a valid email address.").optional().or(z.literal('')),
  lookingFor: z.array(z.string()),
});
const lookingForItems = [
"Furniture",
"Foam",
"Sofa Fabric",
"Curtain Fabric",
"Sheer Fabric",
"Blinds",
"Tassel",
"Fabric Procter",
"Bed Cover",
"Bedsheet Single",
"Bedsheet Double",
"Mattress Protector",
"Pillow Cover",
"Blanket",
"Dohar",
"Quilt",
"Bath Mat",
"Towel",
"Shower Curtain",
"Soap Dispenser",
"Crockery",
"Dustbin",
"Cushion Cover",
"Carpet",
"Door Mat",
"Table Mat",
"Table Cover",
"Other Work"
];

export default function WalkinCustomerPage() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      familyName: "",
      mobile: "",
      customerType:"",
      email: "",
      lookingFor:[],
    },
  });

  console.log("Foam Deatils",form);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user?.id || !user?.name || !user?.email) {
      toast({
        variant: "destructive",
        title: "Missing CRM Identity",
        description: "Please login again before submitting a walk-in form.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await addWalkinCustomer(values, {
        id: user.id,
        name: user.name,
        email: user.email,
      });
      if (result.success) {
        toast({
          title: "Thank You!",
          description: "Your information has been submitted successfully.",
        });
        form.reset();
      } else {
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
     <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-5xl">
        <CardHeader className="text-center">
            <Link href="/">
                <Image src="/logo.png" alt="MoTrack Logo" width={150} height={75} className="mx-auto mb-4" />
            </Link>
          <CardTitle className="text-2xl font-bold">Welcome!</CardTitle>
          <CardDescription>Please provide your details below to connect with us.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your first name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="familyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Family Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your family name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="Enter your mobile number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How did you hear about Us</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Customer Type" />
                        </SelectTrigger>
                      </FormControl>

                      <SelectContent>
                        <SelectItem value="Walk-in">Walk In</SelectItem>
                        <SelectItem value="Returning-Customer">Returning Customer</SelectItem>
                        <SelectItem value="Social-Media">Social Media</SelectItem>
                        <SelectItem value="Advertisement">Advertisement</SelectItem>
                        <SelectItem value="Referal">Referal</SelectItem>
                      </SelectContent>
                    </Select>

                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter your email (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lookingFor"
                render={() => (
                  <FormItem>
                    <FormLabel>Looking For</FormLabel>

                    <div className="grid grid-cols-4 gap-2">

                      {lookingForItems.map((item) => (
                        <FormField
                          key={item}
                          control={form.control}
                          name="lookingFor"
                          render={({ field }) => {

                            return (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value?.includes(item)}
                                    onChange={(e) => {

                                      const checked = e.target.checked;

                                      if (checked) {
                                        field.onChange([...(field.value || []), item]);
                                      } else {
                                        field.onChange(
                                          field.value?.filter((v) => v !== item)
                                        );
                                      }

                                    }}
                                  />
                                </FormControl>

                                <FormLabel className="font-normal">
                                  {item}
                                </FormLabel>

                              </FormItem>
                            );

                          }}
                        />
                      ))}

                    </div>

                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Mo Designs Pvt. Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
