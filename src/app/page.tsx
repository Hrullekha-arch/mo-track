
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { LogIn, Loader2, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from 'next/image';

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function LoginPage() {
  const { login, loading: authLoading, user, role } = useAuth();
  const [formLoading, setFormLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!authLoading && user) {
      if (role === 'installer') {
        router.push('/mobile');
      } else if (role === 'Purchase') {
        router.push('/dashboard/purchase');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, authLoading, router, role]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setFormLoading(true);
    await login(values.email, values.password);
    setFormLoading(false);
  }

  const isLoading = authLoading || formLoading;

  if (authLoading || (!authLoading && user)) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 relative" key={user ? 'logged-in' : 'logged-out'}>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <Image
              src="/logo.png"
              alt="MoTrack Logo"
              width={200}
              height={100}
              loading="eager"
              style={{ height: "auto" }}
              className="mx-auto"
            />
            <CardDescription className="pt-4">Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="********" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                   Sign In
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        <footer className="mt-8 text-center text-sm text-muted-foreground space-y-2">
            <div className="flex items-center justify-center gap-4">
                 <p>
                    Are you a customer?{" "}
                    <Link href="/track" className="underline hover:text-primary">
                        Track your order here.
                    </Link>
                </p>
                <p>
                     <Link href="/scan" className="underline hover:text-primary flex items-center justify-center gap-1">
                        <ScanLine className="h-4 w-4" /> Scan a Barcode
                    </Link>
                </p>
            </div>
            <p>&copy; {new Date().getFullYear()} Mo Designs Pvt. Ltd. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
