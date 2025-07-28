
'use server';
/**
 * @fileOverview A Genkit flow to mark the entire PMS (Production Management System) process as complete for a given order.
 *
 * - completePmsProcess - A function that handles the PMS completion logic.
 * - CompletePmsInput - The input type for the completePmsProcess function.
 * - CompletePmsOutput - The return type for the completePmsProcess function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { Order, PmsStatus } from '@/lib/types';
import { PMS_PROCESS_CONFIG } from '@/components/features/pms/pms-constants';

const CompletePmsInputSchema = z.object({
  orderId: z.string().describe('The CRM Order No. of the order to complete.'),
});
export type CompletePmsInput = z.infer<typeof CompletePmsInputSchema>;

const CompletePmsOutputSchema = z.object({
  success: z.boolean().describe('Whether the operation was successful.'),
  message: z.string().describe('A message detailing the result of the operation.'),
  order: z.any().optional().describe('The updated order object, if found.'),
});
export type CompletePmsOutput = z.infer<typeof CompletePmsOutputSchema>;

export async function completePmsProcess(input: CompletePmsInput): Promise<CompletePmsOutput> {
  const { orderId } = input;

  if (!orderId) {
    return { success: false, message: 'Order ID is required.' };
  }

  try {
    const ordersRef = adminDb.collection("orders");
    const q = ordersRef.where("crmOrderNo", "==", orderId);
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
      return { success: false, message: `Order with CRM Order No ${orderId} not found.` };
    }
    
    const orderDoc = querySnapshot.docs[0];
    const orderRef = orderDoc.ref;
    const orderData = orderDoc.data() as Omit<Order, 'id'>;
    
    // Ensure pmsMilestones exists
    if (!orderData.pmsMilestones) {
        orderData.pmsMilestones = [];
    }
    
    const order = { id: orderDoc.id, ...orderData } as Order;
    
    // Stop if stitching is already done
    const stitchingDoneMilestone = order.milestones.find(m => m.id === 4);
    if (stitchingDoneMilestone?.completed) {
      return { 
        success: true, 
        message: `Order ${orderId} production is already complete.`,
        order,
      };
    }

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
    
    await orderRef.update(updatePayload);

    const updatedOrder = {
      ...order,
      ...updatePayload
    };

    // We need to serialize the updated order to send it back to the client
    const plainOrderObject = JSON.parse(JSON.stringify(updatedOrder));

    return {
      success: true,
      message: `Order ${orderId} has been marked as 'Stitching Done'.`,
      order: plainOrderObject,
    };
  } catch (error: any) {
    console.error('Error in completePmsProcess flow:', error);
    return {
      success: false,
      message: 'An unexpected error occurred while updating the order.',
    };
  }
}

ai.defineFlow(
  {
    name: 'completePmsProcessFlow',
    inputSchema: CompletePmsInputSchema,
    outputSchema: CompletePmsOutputSchema,
  },
  async (input) => {
    return await completePmsProcess(input);
  }
);
