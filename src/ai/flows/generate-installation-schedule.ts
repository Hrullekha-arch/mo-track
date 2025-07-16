'use server';

/**
 * @fileOverview AI-powered tool that analyzes installer workloads, delivery locations, and deadlines to automatically generate an optimized installation schedule.
 *
 * - generateInstallationSchedule - A function that generates an optimized installation schedule.
 * - GenerateInstallationScheduleInput - The input type for the generateInstallationSchedule function.
 * - GenerateInstallationScheduleOutput - The return type for the generateInstallationSchedule function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateInstallationScheduleInputSchema = z.object({
  installers: z.array(
    z.object({
      id: z.string().describe('The unique identifier of the installer.'),
      name: z.string().describe('The name of the installer.'),
      currentWorkload: z
        .array(z.string())
        .describe('List of order IDs currently assigned to the installer.'),
      location: z.object({
        latitude: z.number().describe('The latitude of the installer.'),
        longitude: z.number().describe('The longitude of the installer.'),
      }).describe('The current location of the installer.'),
    })
  ).describe('A list of available installers and their current workloads and locations.'),
  orders: z.array(
    z.object({
      id: z.string().describe('The unique identifier of the order.'),
      deliveryLocation: z.object({
        latitude: z.number().describe('The latitude of the delivery location.'),
        longitude: z.number().describe('The longitude of the delivery location.'),
      }).describe('The delivery location for the order.'),
      deadline: z.string().describe('The deadline for the installation (ISO 8601 format).'),
      orderType: z.enum(['delivery', 'stitching', 'stitching+installation']).describe('The type of the order.'),
    })
  ).describe('A list of orders needing installation, including delivery locations and deadlines.'),
  currentSchedules: z.record(z.string(), z.array(z.string())).describe('The current installation schedules, with installer IDs as keys and lists of order IDs as values.')
});

export type GenerateInstallationScheduleInput = z.infer<typeof GenerateInstallationScheduleInputSchema>;

const GenerateInstallationScheduleOutputSchema = z.record(z.string(), z.array(z.string())).describe('An optimized installation schedule, with installer IDs as keys and lists of order IDs as values.');

export type GenerateInstallationScheduleOutput = z.infer<typeof GenerateInstallationScheduleOutputSchema>;

export async function generateInstallationSchedule(input: GenerateInstallationScheduleInput): Promise<GenerateInstallationScheduleOutput> {
  return generateInstallationScheduleFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateInstallationSchedulePrompt',
  input: {schema: GenerateInstallationScheduleInputSchema},
  output: {schema: GenerateInstallationScheduleOutputSchema},
  prompt: `You are an AI assistant helping a dispatcher generate an optimized installation schedule.

  Analyze the current workloads of installers, delivery locations, and deadlines to automatically generate an optimized installation schedule.
  Minimize delays and efficiently assign tasks.

  Consider the following installers:
  {{#each installers}}
  - ID: {{this.id}}, Name: {{this.name}}, Current Workload: {{this.currentWorkload}}, Location: {{this.location.latitude}}, {{this.location.longitude}}
  {{/each}}

  Consider the following orders:
  {{#each orders}}
  - ID: {{this.id}}, Delivery Location: {{this.deliveryLocation.latitude}}, {{this.deliveryLocation.longitude}}, Deadline: {{this.deadline}}, Order Type: {{this.orderType}}
  {{/each}}

  Current Schedules:
  {{#each (lookup currentSchedules)}}
    {{@key}}: {{this}}
  {{/each}}

  Generate an optimized installation schedule in JSON format, with installer IDs as keys and lists of order IDs as values. Return only the JSON, do not include any other explanation.
  Ensure that the output is valid JSON that can be parsed by Javascript.
  `,
});

const generateInstallationScheduleFlow = ai.defineFlow(
  {
    name: 'generateInstallationScheduleFlow',
    inputSchema: GenerateInstallationScheduleInputSchema,
    outputSchema: GenerateInstallationScheduleOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
