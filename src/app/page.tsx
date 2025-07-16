
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { LogIn, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function LoginPage() {
  const { login, loading: authLoading, user } = useAuth();
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
      if (user.role === 'installer') {
        router.push('/mobile');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setFormLoading(true);
    await login(values.email, values.password);
    setFormLoading(false);
  }

  const quickLogin = (email: string) => {
    form.setValue('email', email);
    form.setValue('password', 'password'); // Default password for demo
    form.handleSubmit(onSubmit)();
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">MoTrack Login</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
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
            <div className="mt-4 text-center text-sm">
              <p className="text-muted-foreground mb-2">For demo purposes, quick login:</p>
              <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => quickLogin('admin@motrack.com')} disabled={isLoading}>Admin</Button>
                  <Button variant="outline" size="sm" onClick={() => quickLogin('employee@motrack.com')} disabled={isLoading}>Employee</Button>
                  <Button variant="outline" size="sm" onClick={() => quickLogin('john.doe@motrack.com')} disabled={isLoading}>Installer</Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <footer className="mt-8 text-center text-sm text-muted-foreground">
            <p>
                Are you a customer?{" "}
                <Link href="/track" className="underline hover:text-primary">
                    Track your order here.
                </Link>
            </p>
        </footer>
      </div>
    </div>
  );
}
