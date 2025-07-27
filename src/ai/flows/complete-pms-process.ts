
'use server';

/**
 * @fileOverview AI flow to mark the production process as complete for an order.
 * This is triggered by the PMS barcode scanner.
 * - completePmsProcess - Marks the 'Stitching Done' milestone as complete.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from '@/lib/types';

const CompletePmsInputSchema = z.object({
  orderId: z.string().describe('The unique identifier of the order to update.'),
});
export type CompletePmsInput = z.infer<typeof CompletePmsInputSchema>;

const CompletePmsOutputSchema = z.object({
  success: z.boolean().describe('Whether the update was successful.'),
  message: z.string().describe('A message indicating the result of the operation.'),
  orderStatus: z.string().optional().describe('The new status of the order.'),
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
      const orderRef = doc(db, 'orders', orderId);
      const docSnap = await getDoc(orderRef);

      if (!docSnap.exists()) {
        return { success: false, message: `Order with ID ${orderId} not found.` };
      }

      const order = { id: docSnap.id, ...docSnap.data() } as Order;
      
      const sentToStitching = order.milestones.find(m => m.id === 3);
      if (!sentToStitching?.completed) {
        return { success: false, message: 'This order has not been sent to stitching yet.' };
      }

      const stitchingDone = order.milestones.find(m => m.id === 4);
      if (stitchingDone?.completed) {
        return { success: true, message: 'This order\'s production is already marked as complete.', orderStatus: 'Stitching Done' };
      }

      // Update the 'Stitching Done' milestone
      const updatedMilestones = order.milestones.map(m =>
        m.id === 4
          ? {
              ...m,
              completed: true,
              completedAt: new Date().toISOString(),
              completedBy: 'PMS Scanner',
            }
          : m
      );

      await updateDoc(orderRef, { milestones: updatedMilestones });

      return {
        success: true,
        message: `Order ${orderId} has been marked as 'Stitching Done'.`,
        orderStatus: 'Stitching Done',
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
