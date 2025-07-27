
"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole } from "@/lib/types";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
  role: z.enum(['admin', 'employee', 'installer', 'salesman', 'Accounts', 'Hr'], { required_error: "Role is required" }),
  designation: z.enum(['CRM', 'Allocators', 'PC']).optional(),
  salesmanCode: z.string().optional(),
}).refine(data => {
    if (data.role === 'employee' && !data.designation) {
        return false;
    }
    return true;
}, {
    message: "Designation is required for employees",
    path: ["designation"],
}).refine(data => {
    // Other roles besides employee and salesman should not have designation or salesmanCode
    if (data.role !== 'employee' && data.designation) {
        return false;
    }
    if (data.role !== 'salesman' && data.salesmanCode) {
        return false;
    }
    return true;
}, {
    message: "This field is not applicable for the selected role.",
    path: ["designation"], // Path can be adjusted based on where you want the error
});


interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function UserFormDialog({ isOpen, onClose, user }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'employee',
      designation: undefined,
      salesmanCode: '',
    },
  });

  const role = form.watch('role');

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        password: '',
        salesmanCode: user.salesmanCode || '',
      });
    } else {
      form.reset({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        designation: undefined,
        salesmanCode: '',
      });
    }
  }, [user, isOpen, form]);

  useEffect(() => {
      if (role !== 'employee') {
          form.setValue('designation', undefined);
      }
      if (role !== 'salesman') {
          form.setValue('salesmanCode', '');
      }
  }, [role, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      if (isEditing) {
        // Update existing user in Firestore
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, {
            name: values.name,
            role: values.role,
            designation: values.designation || null,
            salesmanCode: values.salesmanCode || null,
        });
        toast({ title: "User Updated", description: "User details have been successfully updated." });
      } else {
        // Create new user
        if (!values.password) {
            form.setError("password", { message: "Password is required for new users."});
            setLoading(false);
            return;
        }
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
            const authUser = userCredential.user;

            const newUser: Omit<User, 'id'> = {
                name: values.name,
                email: values.email,
                role: values.role,
            };
            if (values.designation && values.role === 'employee') {
                newUser.designation = values.designation;
            }
             if (values.salesmanCode && values.role === 'salesman') {
                newUser.salesmanCode = values.salesmanCode;
            }
            
            await setDoc(doc(db, "users", authUser.uid), newUser);
            toast({ title: "User Created", description: "New user has been successfully created." });

        } catch (error: any) {
             console.error("Error creating user:", error);
             let errorMessage = "Could not create the user.";
             if (error.code === 'auth/email-already-in-use') {
                 errorMessage = "A user with this email address already exists.";
             }
             toast({
                variant: "destructive",
                title: "Creation Failed",
                description: errorMessage,
            });
            // Re-throw to be caught by the outer catch block
            throw error;
        }
      }
      form.reset();
      onClose();
    } catch (error: any) {
      // This outer catch block will now receive more specific errors.
      console.error("Error saving user: ", error);
      // The specific error message is already shown in the inner try-catch
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
            form.reset();
            onClose();
        }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit User' : 'Create New User'}</DialogTitle>
          <DialogDescription>
            Fill in the details below to {isEditing ? 'update the user' : 'create a new user'}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="name@example.com" {...field} disabled={isEditing} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isEditing && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl><Input type="password" placeholder="********" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                 <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                            <SelectItem value="installer">Installer</SelectItem>
                            <SelectItem value="salesman">Salesman</SelectItem>
                            <SelectItem value="Accounts">Accounts</SelectItem>
                            <SelectItem value="Hr">HR</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
              )}
            />
             {role === 'employee' && (
                <FormField
                    control={form.control}
                    name="designation"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Designation</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Select a designation" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="CRM">CRM</SelectItem>
                                    <SelectItem value="Allocators">Allocators</SelectItem>
                                    <SelectItem value="PC">PC</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
             )}
            {role === 'salesman' && (
              <FormField
                control={form.control}
                name="salesmanCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salesman Code</FormLabel>
                    <FormControl><Input placeholder="e.g. S001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditing ? 'Save Changes' : 'Create User'}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
