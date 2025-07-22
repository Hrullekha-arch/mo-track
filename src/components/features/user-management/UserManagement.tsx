
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, UserRole } from '@/lib/types';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { UserFormDialog } from './UserFormDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalesmanCrmAssignments } from './SalesmanCrmAssignments';
import { UserTable } from './UserTable';

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
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

  const { admins, employees, installers, salesmen, accounts, hr, crm, allocators, pc } = useMemo(() => {
    const admins = users.filter(u => u.role === 'admin');
    const employees = users.filter(u => u.role === 'employee');
    const installers = users.filter(u => u.role === 'installer');
    const salesmen = users.filter(u => u.role === 'salesman');
    const accounts = users.filter(u => u.role === 'Accounts');
    const hr = users.filter(u => u.role === 'Hr');

    const crm = employees.filter(e => e.designation === 'CRM');
    const allocators = employees.filter(e => e.designation === 'Allocators');
    const pc = employees.filter(e => e.designation === 'PC');

    return { admins, employees, installers, salesmen, accounts, hr, crm, allocators, pc };
  }, [users]);


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
            <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="all">All Users</TabsTrigger>
                <TabsTrigger value="admin">Admins</TabsTrigger>
                <TabsTrigger value="employee">Employees</TabsTrigger>
                <TabsTrigger value="installer">Installers</TabsTrigger>
                <TabsTrigger value="salesman">Salesmen</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="hr">HR</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
                <Card>
                    <CardHeader>
                        <CardTitle>All Users</CardTitle>
                        <CardDescription>A comprehensive list of every user in the system.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserTable users={users} title="All Users" description="A comprehensive list of every user in the system." />
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
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="all">All Employees</TabsTrigger>
                        <TabsTrigger value="crm">CRM</TabsTrigger>
                        <TabsTrigger value="allocators">Allocators</TabsTrigger>
                        <TabsTrigger value="pc">PC</TabsTrigger>
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
                    <TabsContent value="pc">
                         <Card>
                            <CardHeader>
                                <CardTitle>PC Team</CardTitle>
                                <CardDescription>Employees with the PC designation.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <UserTable users={pc} title="PC Team" description="Employees with the PC designation." />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
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

    