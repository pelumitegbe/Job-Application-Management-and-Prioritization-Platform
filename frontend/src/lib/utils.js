import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (shadcn/ui helper). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
