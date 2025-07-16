import { getMilestonesForOrder } from './constants';
import type { Order, User, UserRole } from './types';

export const mockUsers: User[] = [
  { id: 'user-1', name: 'Admin User', email: 'admin@motrack.com', role: 'admin', avatarUrl: 'https://placehold.co/100x100' },
  { id: 'user-2', name: 'Employee User', email: 'employee@motrack.com', role: 'employee', avatarUrl: 'https://placehold.co/100x100' },
  { id: 'user-3', name: 'Installer John', email: 'john@motrack.com', role: 'installer', avatarUrl: 'https://placehold.co/100x100' },
  { id: 'user-4', name: 'Installer Jane', email: 'jane@motrack.com', role: 'installer', avatarUrl: 'https://placehold.co/100x100' },
  { id: 'user-5', name: 'Sarah (Sales)', email: 'sarah@motrack.com', role: 'employee', avatarUrl: 'https://placehold.co/100x100' },
];

export const mockInstallers = mockUsers.filter(u => u.role === 'installer');

export const mockOrders: Order[] = [
  {
    id: 'MOTRACK-1001',
    customerName: 'Alice Johnson',
    customerPhone: '123-456-7890',
    customerAddress: '123 Main St, Anytown, USA',
    salesPerson: 'Sarah (Sales)',
    orderType: 'stitching+installation',
    milestones: getMilestonesForOrder('stitching+installation').map((m, i) => ({ ...m, completed: i < 3, completedAt: i < 3 ? new Date().toISOString() : undefined, completedBy: i < 3 ? 'user-2' : undefined })),
    assignedTo: 'user-3',
    createdAt: new Date('2024-05-01').toISOString(),
  },
  {
    id: 'MOTRACK-1002',
    customerName: 'Bob Williams',
    customerPhone: '234-567-8901',
    customerAddress: '456 Oak Ave, Anytown, USA',
    salesPerson: 'Sarah (Sales)',
    orderType: 'delivery',
    milestones: getMilestonesForOrder('delivery').map((m, i) => ({ ...m, completed: i < 1, completedAt: i < 1 ? new Date().toISOString() : undefined, completedBy: i < 1 ? 'user-2' : undefined })),
    createdAt: new Date('2024-05-02').toISOString(),
  },
  {
    id: 'MOTRACK-1003',
    customerName: 'Charlie Brown',
    customerPhone: '345-678-9012',
    customerAddress: '789 Pine Ln, Anytown, USA',
    salesPerson: 'Sarah (Sales)',
    orderType: 'stitching',
    milestones: getMilestonesForOrder('stitching').map((m, i) => ({ ...m, completed: i < 5, completedAt: i < 5 ? new Date().toISOString() : undefined, completedBy: i < 5 ? 'user-2' : undefined })),
    assignedTo: 'user-4',
    createdAt: new Date('2024-05-03').toISOString(),
  },
];
