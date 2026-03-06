

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/lib/types";
import { Loader2, Info, PlusCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { navItems } from "@/components/shared/AppShell";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
  role: z.enum(['admin', 'employee', 'installer', 'salesman', 'Accounts', 'Hr', 'Purchase'], { required_error: "Role is required" }),
  store: z.string().optional(),
  designation: z.enum(['CRM', 'Allocators', 'PC']).optional(),
  salesmanCode: z.string().optional(),
  dayOff: z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']).optional(),
  permissions: z.array(z.string()).optional(),
}).refine(data => {
    if (data.role === 'employee' && !data.designation) {
        return false;
    }
    return true;
}, {
    message: "Designation is required for employees",
    path: ["designation"],
}).superRefine((data, ctx) => {
    if (data.role !== 'employee' && data.designation) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["designation"],
            message: "Designation is only applicable for employees.",
        });
    }
    if (data.role !== 'salesman' && data.salesmanCode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["salesmanCode"],
            message: "Salesman code is only applicable for salesmen.",
        });
    }
    if (data.role !== 'installer' && data.dayOff) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dayOff"],
            message: "Day off is only applicable for installers.",
        });
    }
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
      store: '',
      designation: undefined,
      salesmanCode: '',
      dayOff: undefined,
      permissions: [],
    },
  });

  const role = form.watch('role');

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role,
        store: user.store || '',
        designation: user.designation,
        password: '',
        salesmanCode: user.salesmanCode || '',
        dayOff: user.dayOff,
        permissions: user.permissions || [],
      });
    } else {
      form.reset({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        store: '',
        designation: undefined,
        salesmanCode: '',
        dayOff: undefined,
        permissions: [],
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
      if (role !== 'installer') {
          form.setValue('dayOff', undefined);
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
            store: values.store || null,
            designation: values.designation || null,
            salesmanCode: values.salesmanCode || null,
            dayOff: values.role === 'installer' ? (values.dayOff || null) : null,
            permissions: values.permissions || [],
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
                store: values.store,
                permissions: values.permissions || [],
            };
            if (values.designation && values.role === 'employee') {
                newUser.designation = values.designation;
            }
             if (values.salesmanCode && values.role === 'salesman') {
                newUser.salesmanCode = values.salesmanCode;
            }
            if (values.dayOff && values.role === 'installer') {
                newUser.dayOff = values.dayOff;
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-4">
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
                            <SelectItem value="Purchase">Purchase</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="store"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Store</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Assign a store" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="MO GCR BRANCH">MO GCR BRANCH</SelectItem>
                            <SelectItem value="MO MG ROAD">MO MG ROAD</SelectItem>
                            <SelectItem value="MO SULTANPUR">MO SULTANPUR</SelectItem>
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
            {role === 'installer' && (
              <FormField
                control={form.control}
                name="dayOff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day Off</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "__none__" ? undefined : value)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select weekly day off" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No Day Off</SelectItem>
                        <SelectItem value="sunday">Sunday</SelectItem>
                        <SelectItem value="monday">Monday</SelectItem>
                        <SelectItem value="tuesday">Tuesday</SelectItem>
                        <SelectItem value="wednesday">Wednesday</SelectItem>
                        <SelectItem value="thursday">Thursday</SelectItem>
                        <SelectItem value="friday">Friday</SelectItem>
                        <SelectItem value="saturday">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             <Separator />
            <FormField
                control={form.control}
                name="permissions"
                render={() => (
                    <FormItem>
                        <div className="mb-4">
                            <FormLabel className="text-base">Module Permissions</FormLabel>
                            <FormDescription>
                                Select the modules this user can access.
                            </FormDescription>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                        {navItems.map((item) => (
                            <FormField
                                key={item.href}
                                control={form.control}
                                name="permissions"
                                render={({ field }) => {
                                    return (
                                    <FormItem
                                        key={item.href}
                                        className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                        <FormControl>
                                        <Checkbox
                                            checked={field.value?.includes(item.href)}
                                            onCheckedChange={(checked) => {
                                            return checked
                                                ? field.onChange([...(field.value || []), item.href])
                                                : field.onChange(
                                                    (field.value || []).filter(
                                                        (value) => value !== item.href
                                                    )
                                                    )
                                            }}
                                        />
                                        </FormControl>
                                        <FormLabel className="font-normal">
                                            {item.label}
                                        </FormLabel>
                                    </FormItem>
                                    )
                                }}
                            />
                         ))}
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
             />
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
