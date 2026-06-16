import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// lib/utils/quantity.ts - Simple, testable helpers

/** Parse any value to number, return 0 if invalid */
export function parseNumber(value: unknown): number {
  const num = Number(String(value).trim());
  return Number.isFinite(num) ? num : 0;
}

/** Format number to 2 decimals, remove trailing zeros */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** Calculate remaining quantity */
export function calculateRemaining(expected: number, received: number): number {
  return Math.max(0, expected - received);
}

/** Check if fully received (with small tolerance for float errors) */
export function isFullyReceived(expected: number, received: number): boolean {
  const EPSILON = 0.0001;
  return expected <= EPSILON || received + EPSILON >= expected;
}