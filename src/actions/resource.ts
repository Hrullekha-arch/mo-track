"use server";

import type { MachineResource, PersonResource, RoutingStep } from "@/types";

const PEOPLE: PersonResource[] = [
  { id: "p-1", name: "Ajay Kumar", role: "Artisan", helperType: "Carpenter", mobile: "9000000001", active: true },
  { id: "p-2", name: "Rahul Das", role: "Supervisor", helperType: "SM", mobile: "9000000002", active: true },
  { id: "p-3", name: "Sonika Devi", role: "Helper", helperType: "Upholstery", mobile: "9000000003", active: true },
  { id: "p-4", name: "Mohan Lal", role: "Painter", helperType: "Polish", mobile: "9000000004", active: true },
];

const MACHINES: MachineResource[] = [
  { id: "m-1", code: "MC-001", name: "Panel Saw", category: "Cutting", process: "Wood Cutting", active: true },
  { id: "m-2", code: "MC-002", name: "Router Machine", category: "Shaping", process: "Grooving", active: true },
  { id: "m-3", code: "MC-003", name: "Edge Sander", category: "Finishing", process: "Sanding", active: true },
];

const ROUTING: RoutingStep[] = [
  { id: "r-1", productType: "Bed", stepNo: 1, stageName: "Measurement Review", checkpoint: "Demand validated", estimatedHours: 1 },
  { id: "r-2", productType: "Bed", stepNo: 2, stageName: "Bed Drawing", checkpoint: "Dimension locked", estimatedHours: 2 },
  { id: "r-3", productType: "Bed", stepNo: 3, stageName: "Furniture Drawing", checkpoint: "Construction validated", estimatedHours: 3 },
  { id: "r-4", productType: "Bed", stepNo: 4, stageName: "SM Approval", checkpoint: "Approve or reject", estimatedHours: 1 },
  { id: "r-5", productType: "Bed", stepNo: 5, stageName: "BOM Release", checkpoint: "All material available", estimatedHours: 1 },
  { id: "r-6", productType: "Bed", stepNo: 6, stageName: "Workshop Start", checkpoint: "Barcode scan live", estimatedHours: 0.5 },
];

export async function getPeopleResources() {
  return PEOPLE;
}

export async function getMachineResources() {
  return MACHINES;
}

export async function getRoutingConfiguration() {
  return ROUTING;
}

export async function createResource(payload: unknown) {
  return {
    success: true,
    message: "Resource draft accepted.",
    payload,
  };
}
