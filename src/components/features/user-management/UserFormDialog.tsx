

"use client";

import { useEffect, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { navItems } from "@/components/shared/AppShell";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const ALLOCATE_ORDER_PERMISSION = "/dashboard/orders";
const SALES_MODULE_PERMISSION = "/dashboard/Sales";
const PC_ALL_SALES_PERMISSIONS = [
  SALES_MODULE_PERMISSION,
  ALLOCATE_ORDER_PERMISSION,
];
const DEFAULT_STORE_OPTIONS = ["MO GCR BRANCH", "MO MG ROAD"];

const parseTimeToMinutes = (value?: string) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const normalizeDayOff = (value?: string | null): User["dayOff"] => {
  const normalized = value?.trim().toLowerCase();
  return WEEKDAYS.find((day) => day === normalized);
};

const formatWeekOff = (value?: User["dayOff"] | null) => {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
  role: z.enum(['admin', 'employee', 'installer', 'salesman', 'Accounts', 'Hr', 'Purchase', 'PC', 'IT', 'Data Analytics'], { required_error: "Role is required" }),
  isActive: z.boolean().optional(),
  store: z.string().optional(),
  designation: z.enum(['CRM', 'Allocators', 'PC', 'EA', 'salesmanager', 'Recruiter', 'MIS & Data Analytics', 'Software Developer', 'ERP Development & Sr. Data Analytics/MIS']).optional(),
  salesmanCode: z.string().optional(),
  dayOff: z.enum(WEEKDAYS).optional(),
  permissions: z.array(z.string()).optional(),
  timesheetEnabled: z.boolean().optional(),
  timesheetDutyStart: z.string().optional(),
  timesheetDutyEnd: z.string().optional(),
}).superRefine((data, ctx) => {
    const isTimesheetRoleAllowed = data.role !== "admin" && data.role !== "installer";
    if (data.timesheetEnabled && !isTimesheetRoleAllowed) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["timesheetEnabled"],
            message: "Timesheet is applicable only for non-admin, non-installer users.",
        });
    }
    if (data.timesheetEnabled) {
        const startMinutes = parseTimeToMinutes(data.timesheetDutyStart);
        const endMinutes = parseTimeToMinutes(data.timesheetDutyEnd);
        if (startMinutes === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["timesheetDutyStart"],
                message: "Duty start time is required.",
            });
        }
        if (endMinutes === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["timesheetDutyEnd"],
                message: "Duty end time is required.",
            });
        }
        if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["timesheetDutyEnd"],
                message: "Duty end time must be after start time.",
            });
        }
    }
});


interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function UserFormDialog({ isOpen, onClose, user }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isDutyTimeDialogOpen, setIsDutyTimeDialogOpen] = useState(false);
  const [draftDutyStart, setDraftDutyStart] = useState("10:00");
  const [draftDutyEnd, setDraftDutyEnd] = useState("19:00");
  const [storeOptions, setStoreOptions] = useState<string[]>(DEFAULT_STORE_OPTIONS);
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'employee',
      isActive: true,
      store: '',
      designation: undefined,
      salesmanCode: '',
      dayOff: undefined,
      permissions: [],
      timesheetEnabled: false,
      timesheetDutyStart: '',
      timesheetDutyEnd: '',
    },
  });

  const role = form.watch('role');
  const isTimesheetRoleAllowed = role !== "admin" && role !== "installer";
  const timesheetEnabled = Boolean(form.watch('timesheetEnabled'));
  const timesheetDutyStart = form.watch('timesheetDutyStart');
  const timesheetDutyEnd = form.watch('timesheetDutyEnd');

  useEffect(() => {
    return onSnapshot(doc(db, "appSettings", "storeOptions"), (snapshot) => {
      const storedOptions = snapshot.data()?.stores;
      if (Array.isArray(storedOptions) && storedOptions.length) {
        setStoreOptions(
          storedOptions.map((store) => String(store || "").trim()).filter(Boolean)
        );
      } else {
        setStoreOptions(DEFAULT_STORE_OPTIONS);
      }
    });
  }, []);

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive !== false,
        store: user.store || '',
        designation: user.designation,
        password: '',
        salesmanCode: user.salesmanCode || '',
        dayOff: normalizeDayOff(user.dayOff || user.weekOff),
        permissions: user.permissions || [],
        timesheetEnabled: Boolean(user.timesheetEnabled),
        timesheetDutyStart: user.timesheetDutyStart || '',
        timesheetDutyEnd: user.timesheetDutyEnd || '',
      });
    } else {
      form.reset({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        isActive: true,
        store: '',
        designation: undefined,
        salesmanCode: '',
        dayOff:undefined,
        permissions: [],
        timesheetEnabled: false,
        timesheetDutyStart: '',
        timesheetDutyEnd: '',
      });
    }
    setIsDutyTimeDialogOpen(false);
  }, [user, isOpen, form]);

  useEffect(() => {
      if (role !== 'salesman') {
          form.setValue('salesmanCode', '');
      }
      if (role !== "PC") {
          const permissions = form.getValues("permissions") || [];
          if (permissions.includes(ALLOCATE_ORDER_PERMISSION)) {
              form.setValue(
                  "permissions",
                  permissions.filter((permission) => permission !== ALLOCATE_ORDER_PERMISSION)
              );
          }
      }
      if (role === 'admin' || role === 'installer') {
          form.setValue("timesheetEnabled", false);
          form.setValue("timesheetDutyStart", "");
          form.setValue("timesheetDutyEnd", "");
          form.clearErrors(["timesheetEnabled", "timesheetDutyStart", "timesheetDutyEnd"]);
      }
  }, [role, form]);

  const openDutyTimeDialog = () => {
    setDraftDutyStart(form.getValues("timesheetDutyStart") || "10:00");
    setDraftDutyEnd(form.getValues("timesheetDutyEnd") || "19:00");
    setIsDutyTimeDialogOpen(true);
  };

  const applyDutyTimeConfig = () => {
    const startMinutes = parseTimeToMinutes(draftDutyStart);
    const endMinutes = parseTimeToMinutes(draftDutyEnd);

    if (startMinutes === null) {
      form.setError("timesheetDutyStart", { message: "Duty start time is required." });
      return;
    }
    if (endMinutes === null) {
      form.setError("timesheetDutyEnd", { message: "Duty end time is required." });
      return;
    }
    if (endMinutes <= startMinutes) {
      form.setError("timesheetDutyEnd", { message: "Duty end time must be after start time." });
      return;
    }

    form.clearErrors(["timesheetDutyStart", "timesheetDutyEnd"]);
    form.setValue("timesheetDutyStart", draftDutyStart, { shouldValidate: true });
    form.setValue("timesheetDutyEnd", draftDutyEnd, { shouldValidate: true });
    setIsDutyTimeDialogOpen(false);
  };

  const getFirstFormErrorMessage = (errors: FieldErrors<z.infer<typeof formSchema>>): string | null => {
    const queue: any[] = Object.values(errors || {});
    while (queue.length) {
      const item = queue.shift();
      if (!item) continue;
      if (typeof item.message === "string" && item.message.trim()) {
        return item.message;
      }
      if (typeof item === "object") {
        queue.push(...Object.values(item));
      }
    }
    return null;
  };

  const onInvalidSubmit = (errors: FieldErrors<z.infer<typeof formSchema>>) => {
    const message = getFirstFormErrorMessage(errors) || "Please check the form fields and try again.";
    toast({
      variant: "destructive",
      title: "Cannot Save User",
      description: message,
    });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      if (!isEditing && values.role === "admin") {
        form.setError("role", {
          message: "Admin access cannot be assigned from this form.",
        });
        throw new Error("Admin access cannot be assigned from this form.");
      }
      const requestedPermissions = values.permissions || [];
      const hasAllocateOrderPermission = requestedPermissions.includes(ALLOCATE_ORDER_PERMISSION);
      if (hasAllocateOrderPermission && values.role !== "PC") {
        form.setError("permissions", {
          message: "Allocate Order access can only be assigned to a PC role user.",
        });
        throw new Error("Allocate Order access can only be assigned to a PC role user.");
      }
      const normalizedPermissions =
        values.role === "PC"
          ? requestedPermissions
          : requestedPermissions.filter((permission) => permission !== ALLOCATE_ORDER_PERMISSION);
      const normalizedDesignation = values.designation || null;
      const normalizedSalesmanCode = values.role === "salesman" ? (values.salesmanCode || null) : null;
      const normalizedDayOff = values.dayOff || null;
      const isTimesheetApplicable = values.role !== "admin" && values.role !== "installer";
      const normalizedTimesheetEnabled = isTimesheetApplicable && Boolean(values.timesheetEnabled);
      const normalizedTimesheetStart = normalizedTimesheetEnabled ? (values.timesheetDutyStart || null) : null;
      const normalizedTimesheetEnd = normalizedTimesheetEnabled ? (values.timesheetDutyEnd || null) : null;

      if (isEditing) {
        // Update existing user in Firestore
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, {
            name: values.name,
            email: values.email,
            role: values.role,
            isActive: values.isActive !== false,
            store: values.store || null,
            designation: normalizedDesignation,
            salesmanCode: normalizedSalesmanCode,
            dayOff: normalizedDayOff,
            weekOff: formatWeekOff(normalizedDayOff),
            permissions: normalizedPermissions,
            timesheetEnabled: normalizedTimesheetEnabled,
            timesheetDutyStart: normalizedTimesheetStart,
            timesheetDutyEnd: normalizedTimesheetEnd,
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
                isActive: values.isActive !== false,
                store: values.store,
                permissions: normalizedPermissions,
                timesheetEnabled: normalizedTimesheetEnabled,
            };
            if (normalizedDesignation) {
                newUser.designation = normalizedDesignation;
            }
             if (normalizedSalesmanCode) {
                newUser.salesmanCode = normalizedSalesmanCode;
            }
            if (normalizedDayOff) {
                newUser.dayOff = normalizedDayOff;
                newUser.weekOff = formatWeekOff(normalizedDayOff) || undefined;
            }
            if (normalizedTimesheetEnabled && normalizedTimesheetStart && normalizedTimesheetEnd) {
                newUser.timesheetDutyStart = normalizedTimesheetStart;
                newUser.timesheetDutyEnd = normalizedTimesheetEnd;
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
      console.error("Error saving user: ", error);
      toast({
        variant: "destructive",
        title: isEditing ? "Update Failed" : "Save Failed",
        description: error?.message || "Could not save user details. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
          if (!open) {
              form.reset();
              setIsDutyTimeDialogOpen(false);
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
            <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-4">
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
                  <FormControl><Input type="email" placeholder="name@example.com" {...field} /></FormControl>
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
                            {isEditing && user?.role === "admin" ? (
                              <SelectItem value="admin">Admin</SelectItem>
                            ) : null}
                            <SelectItem value="employee">Employee</SelectItem>
                            <SelectItem value="installer">Installer</SelectItem>
                            <SelectItem value="salesman">Salesman</SelectItem>
                            <SelectItem value="Accounts">Accounts</SelectItem>
                            <SelectItem value="Hr">HR</SelectItem>
                            <SelectItem value="Purchase">Purchase</SelectItem>
                            <SelectItem value="PC">PC</SelectItem>
                            <SelectItem value="IT">IT</SelectItem>
                            <SelectItem value="Data Analytics">Data Analytics</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <FormLabel className="text-sm font-medium">Account Status</FormLabel>
                    <FormDescription className="text-xs">
                      Active users can access assigned modules. Inactive users see no dashboard modules.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {field.value !== false ? "Active" : "Inactive"}
                      </span>
                      <Switch
                        checked={field.value !== false}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="store"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Store</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Assign a store" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {Array.from(new Set([...(field.value ? [field.value] : []), ...storeOptions]))
                              .map((store) => (
                                <SelectItem key={store} value={store}>{store}</SelectItem>
                              ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
                )}
            />
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
                                <SelectItem value="EA">EA</SelectItem>
                                <SelectItem value="salesmanager">Sales Manager</SelectItem>
                                <SelectItem value="Recruiter">Recruiter</SelectItem>
                                <SelectItem value="MIS & Data Analytics">MIS &amp; Data Analytics</SelectItem>
                                <SelectItem value="Software Developer">Software Developer</SelectItem>
                                <SelectItem value="ERP Development & Sr. Data Analytics/MIS">
                                  ERP Development &amp; Sr. Data Analytics/MIS
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
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
              <FormField
                  control={form.control}
                  name="dayOff"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day Off / Week Off</FormLabel>
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
            <Separator />
            {isTimesheetRoleAllowed ? (
              <FormField
                control={form.control}
                name="timesheetEnabled"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <FormLabel className="text-sm font-medium">Enable Timesheet</FormLabel>
                        <FormDescription className="text-xs">
                          User must submit hourly work updates during duty time.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={Boolean(field.value)}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked) {
                              if (!form.getValues("timesheetDutyStart") || !form.getValues("timesheetDutyEnd")) {
                                openDutyTimeDialog();
                              }
                            } else {
                              form.setValue("timesheetDutyStart", "", { shouldValidate: true });
                              form.setValue("timesheetDutyEnd", "", { shouldValidate: true });
                              form.clearErrors(["timesheetDutyStart", "timesheetDutyEnd"]);
                            }
                          }}
                        />
                      </FormControl>
                    </div>
                    {timesheetEnabled && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-slate-700">
                            Duty:{" "}
                            <span className="font-medium">
                              {timesheetDutyStart || "--:--"} - {timesheetDutyEnd || "--:--"}
                            </span>
                          </p>
                          <Button type="button" variant="outline" size="sm" onClick={openDutyTimeDialog}>
                            Set Duty Time
                          </Button>
                        </div>
                        {form.formState.errors.timesheetDutyStart?.message && (
                          <p className="mt-1 text-xs text-destructive">
                            {form.formState.errors.timesheetDutyStart.message}
                          </p>
                        )}
                        {form.formState.errors.timesheetDutyEnd?.message && (
                          <p className="mt-1 text-xs text-destructive">
                            {form.formState.errors.timesheetDutyEnd.message}
                          </p>
                        )}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium text-slate-700">Timesheet</p>
                <p className="text-xs text-slate-500">Not applicable for Admin and Installer roles.</p>
              </div>
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
                         {role === "PC" ? (
                            <>
                                <FormField
                                    control={form.control}
                                    name="permissions"
                                    render={({ field }) => {
                                        const permissions = field.value || [];
                                        const hasAllSalesComponents = PC_ALL_SALES_PERMISSIONS.every(
                                            (permission) => permissions.includes(permission)
                                        );
                                        return (
                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={hasAllSalesComponents}
                                                        onCheckedChange={(checked) =>
                                                            checked
                                                                ? field.onChange(
                                                                    Array.from(
                                                                        new Set([
                                                                            ...permissions,
                                                                            ...PC_ALL_SALES_PERMISSIONS,
                                                                        ])
                                                                    )
                                                                )
                                                                : field.onChange(
                                                                    permissions.filter(
                                                                        (permission) =>
                                                                            !PC_ALL_SALES_PERMISSIONS.includes(permission)
                                                                    )
                                                                )
                                                        }
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel className="font-normal">All Sales Components</FormLabel>
                                                    <FormDescription>
                                                        Shows every Order Management component, including Allocate Order.
                                                    </FormDescription>
                                                </div>
                                            </FormItem>
                                        );
                                    }}
                                />
                                <FormField
                                    control={form.control}
                                    name="permissions"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value?.includes(ALLOCATE_ORDER_PERMISSION)}
                                                    onCheckedChange={(checked) =>
                                                        checked
                                                            ? field.onChange(
                                                                Array.from(
                                                                    new Set([
                                                                        ...(field.value || []),
                                                                        SALES_MODULE_PERMISSION,
                                                                        ALLOCATE_ORDER_PERMISSION,
                                                                    ])
                                                                )
                                                            )
                                                            : field.onChange(
                                                                (field.value || []).filter(
                                                                    (value) => value !== ALLOCATE_ORDER_PERMISSION
                                                                )
                                                            )
                                                    }
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="font-normal">Allocate Order</FormLabel>
                                                <FormDescription>
                                                    Assign or remove Allocate Order access for this PC user.
                                                </FormDescription>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </>
                         ) : null}
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
      <Dialog open={isDutyTimeDialogOpen} onOpenChange={setIsDutyTimeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duty Time</DialogTitle>
            <DialogDescription>
              Set duty start and end time for hourly timesheet updates.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1">
              <Label htmlFor="duty-start-time">Start</Label>
              <Input
                id="duty-start-time"
                type="time"
                step={3600}
                value={draftDutyStart}
                onChange={(event) => setDraftDutyStart(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duty-end-time">End</Label>
              <Input
                id="duty-end-time"
                type="time"
                step={3600}
                value={draftDutyEnd}
                onChange={(event) => setDraftDutyEnd(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsDutyTimeDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyDutyTimeConfig}>
              Save Duty Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
