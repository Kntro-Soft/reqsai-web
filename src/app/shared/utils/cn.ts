import { twMerge } from 'tailwind-merge';

type ClassValue = string | number | null | false | undefined | ClassValue[];

/**
 * Merges Tailwind class names, resolving conflicts (last wins) via tailwind-merge.
 * Mirrors the `cn()` helper used by Spartan UI helm components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(flatten(inputs).join(' '));
}

function flatten(inputs: ClassValue[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) out.push(...flatten(input));
    else out.push(String(input));
  }
  return out;
}
