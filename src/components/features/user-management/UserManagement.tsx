
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, UserRole } from '@/lib/types';
import { PlusCircle, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { UserFormDialog } from './UserFormDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalesmanCrmAssignments } from './SalesmanCrmAssignments';
import { UserTable } from './UserTable';
import { isAllocatorDesignation } from '@/lib/user-access';

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { role } = useAuth();
  const isEmployee = role === 'employee';

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  useEffect(() => {
    const usersQuery = query(collection(db, "users"));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddUser = () => {
    setIsDialogOpen(true);
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const status = user.isActive === false ? "inactive" : "active";
      if (query === "active" || query === "inactive") {
        return status === query;
      }
      const searchableValues = [
        user.name,
        user.email,
        user.role,
        user.designation,
        user.salesmanCode,
        user.store,
        user.dayOff,
        user.weekOff,
        user.employeeCode,
      ];

      return searchableValues.some((value) =>
        String(value || "").toLowerCase().includes(query)
      );
    });
  }, [searchQuery, users]);

  const { admins, employees, installers, salesmen, accounts, hr, purchase, crm, allocators, pc } = useMemo(() => {
    const admins = filteredUsers.filter(u => u.role === 'admin');
    const employees = filteredUsers.filter(u => u.role === 'employee');
    const installers = filteredUsers.filter(u => u.role === 'installer');
    const salesmen = filteredUsers.filter(u => u.role === 'salesman');
    const accounts = filteredUsers.filter(u => u.role === 'Accounts');
    const hr = filteredUsers.filter(u => u.role === 'Hr');
    const purchase = filteredUsers.filter(u => u.role === 'Purchase');

    const crm = employees.filter(e => e.designation === 'CRM');
    const allocators = employees.filter(e => isAllocatorDesignation(e.designation));
    const pc = filteredUsers.filter(u => u.role === 'PC' || (u.role === 'employee' && u.designation === 'PC'));

    return { admins, employees, installers, salesmen, accounts, hr, purchase, crm, allocators, pc };
  }, [filteredUsers]);


  if (loading) {
      return <UserManagementSkeleton />;
  }
  
  return (
    <>
      <div className="w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-muted-foreground">Add, edit, and manage user accounts and permissions.</p>
          </div>
          {!isEmployee && (
            <Button onClick={handleAddUser}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add User
            </Button>
          )}
        </div>

        <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-9">
                <TabsTrigger value="all">All Users</TabsTrigger>
                <TabsTrigger value="admin">Admins</TabsTrigger>
                <TabsTrigger value="employee">Employees</TabsTrigger>
                <TabsTrigger value="pc">PC</TabsTrigger>
                <TabsTrigger value="installer">Installers</TabsTrigger>
                <TabsTrigger value="salesman">Salesmen</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="hr">HR</TabsTrigger>
                <TabsTrigger value="purchase">Purchase</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div>
                            <CardTitle>All Users</CardTitle>
                            <CardDescription>A comprehensive list of every user in the system.</CardDescription>
                        </div>
                        <div className="relative w-full max-w-md">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search users..."
                                className="pl-9 pr-10"
                                aria-label="Search users"
                            />
                            {searchQuery && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Clear user search"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={filteredUsers} title="All Users" description="A comprehensive list of every user in the system." />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="admin">
                <Card>
                    <CardHeader>
                        <CardTitle>Admin Users</CardTitle>
                        <CardDescription>Users with full system access.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={admins} title="Admin Users" description="Users with full system access." />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="employee">
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="all">All Employees</TabsTrigger>
                        <TabsTrigger value="crm">CRM</TabsTrigger>
                        <TabsTrigger value="allocators">Allocators</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                         <Card>
                            <CardHeader>
                                <CardTitle>All Employees</CardTitle>
                                <CardDescription>All users with the employee role.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <UserTable users={employees} title="All Employees" description="All users with the employee role." />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="crm">
                         <Card>
                            <CardHeader>
                                <CardTitle>CRM Team</CardTitle>
                                <CardDescription>Employees with the CRM designation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <UserTable users={crm} title="CRM Team" description="Employees with the CRM designation." />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="allocators">
                         <Card>
                            <CardHeader>
                                <CardTitle>Allocators Team</CardTitle>
                                <CardDescription>Employees with the Allocators designation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <UserTable users={allocators} title="Allocators Team" description="Employees with the Allocators designation." />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </TabsContent>

            <TabsContent value="pc">
                <Card>
                    <CardHeader>
                        <CardTitle>PC Team</CardTitle>
                        <CardDescription>Users with the PC role, including legacy PC-designated employees.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={pc} title="PC Team" description="Users with the PC role, including legacy PC-designated employees." />
                    </CardContent>
                </Card>
            </TabsContent>

             <TabsContent value="installer">
                <Card>
                    <CardHeader>
                        <CardTitle>Installers</CardTitle>
                        <CardDescription>Users responsible for field installations.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={installers} title="Installers" description="Users responsible for field installations." />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="salesman">
                 <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Salesmen</CardTitle>
                            <CardDescription>Users responsible for sales.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UserTable users={salesmen} title="Salesmen" description="Users responsible for sales." />
                        </CardContent>
                    </Card>
                    <SalesmanCrmAssignments />
                </div>
            </TabsContent>

             <TabsContent value="accounts">
                <Card>
                    <CardHeader>
                        <CardTitle>Accounts Team</CardTitle>
                        <CardDescription>Users with the Accounts role.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={accounts} title="Accounts Team" description="Users with the Accounts role." />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="hr">
                <Card>
                    <CardHeader>
                        <CardTitle>HR Team</CardTitle>
                        <CardDescription>Users with the HR role.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={hr} title="HR Team" description="Users with the HR role." />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="purchase">
                <Card>
                    <CardHeader>
                        <CardTitle>Purchase Team</CardTitle>
                        <CardDescription>Users with the Purchase role.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={purchase} title="Purchase Team" description="Users with the Purchase role." />
                    </CardContent>
                </Card>
            </TabsContent>

        </Tabs>
      </div>

      <UserFormDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        user={null}
      />
    </>
  );
}

function UserManagementSkeleton() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Skeleton className="h-9 w-64 mb-2" />
                    <Skeleton className="h-5 w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-7 w-48 mb-2" />
                    <Skeleton className="h-5 w-80" />
                </CardHeader>
                <CardContent>
                   <div className="space-y-4">
                        {Array.from({length: 3}).map((_, i) => (
                           <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-1">
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-4 w-48" />
                                    </div>
                                </div>
                                <Skeleton className="h-6 w-20 rounded-full" />
                                <Skeleton className="h-8 w-8" />
                           </div>
                        ))}
                   </div>
                </CardContent>
            </Card>
        </div>
    )
}
    
