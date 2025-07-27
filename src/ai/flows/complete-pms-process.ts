
'use server';

/**
 * @fileOverview AI flow to mark the production process as complete for an order.
 * This is triggered by the PMS barcode scanner.
 * - completePmsProcess - Marks the 'Stitching Done' milestone as complete.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { doc, getDocs, updateDoc, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order, PmsStatus } from '@/lib/types';
import { PMS_PROCESS_CONFIG } from '@/components/features/pms/pms-constants';


const CompletePmsInputSchema = z.object({
  orderId: z.string().describe('The CRM Order No of the order to update (e.g., MOTRACK-1234).'),
});
export type CompletePmsInput = z.infer<typeof CompletePmsInputSchema>;

const CompletePmsOutputSchema = z.object({
  success: z.boolean().describe('Whether the update was successful.'),
  message: z.string().describe('A message indicating the result of the operation.'),
  order: z.any().optional().describe('The updated order object.'),
});
export type CompletePmsOutput = z.infer<typeof CompletePmsOutputSchema>;

export async function completePmsProcess(input: CompletePmsInput): Promise<CompletePmsOutput> {
  return completePmsProcessFlow(input);
}

const completePmsProcessFlow = ai.defineFlow(
  {
    name: 'completePmsProcessFlow',
    inputSchema: CompletePmsInputSchema,
    outputSchema: CompletePmsOutputSchema,
  },
  async ({ orderId }) => {
    try {
      const ordersRef = collection(db, "orders");
      const q = query(ordersRef, where("crmOrderNo", "==", orderId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return { success: false, message: `Order with CRM Order No ${orderId} not found.` };
      }
      
      const orderDoc = querySnapshot.docs[0];
      const orderRef = orderDoc.ref;
      const orderData = orderDoc.data() as Omit<Order, 'id'>;
      
      // Ensure pmsMilestones exists to prevent errors
      if (!orderData.pmsMilestones) {
          orderData.pmsMilestones = [];
      }

      const order = { id: orderDoc.id, ...orderData } as Order;
      
      const completedAt = new Date().toISOString();
      const completedBy = "PMS Scanner";

      // 1. Complete all PMS steps
      const allPmsSteps: PmsStatus[] = PMS_PROCESS_CONFIG.map(step => ({
          stepId: step.id,
          status: 'completed',
          completedAt,
          completedBy,
      }));

      // 2. Complete the main "Stitching Done" milestone
      const updatedMainMilestones = order.milestones.map(m => 
          m.id === 4 // "Stitching Done" milestone
          ? { ...m, completed: true, completedAt, completedBy }
          : m
      );

      const updatePayload = {
          milestones: updatedMainMilestones,
          pmsMilestones: allPmsSteps
      };
      
      await updateDoc(orderRef, updatePayload);

      const updatedOrder = {
        ...order,
        ...updatePayload
      };

      return {
        success: true,
        message: `Order ${orderId} has been marked as 'Stitching Done'.`,
        order: updatedOrder,
      };
    } catch (error: any) {
      console.error('Error in completePmsProcessFlow:', error);
      return {
        success: false,
        message: 'An unexpected error occurred while updating the order.',
      };
    }
  }
);
