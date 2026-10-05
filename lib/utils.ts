import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Primer nombre de un "names" completo tipo "Sebastian Castañeda Marín" (formato del
 * gateway de Jelou, ver widget_back_end/agent/lib/jelou-gateway.ts) — para saludos, un nombre completo se
 * siente formal/robótico ("Hola Sebastian Castañeda Marín"); solo el de pila es más natural.
 */
export function firstName(names: string | undefined): string | undefined {
  const trimmed = names?.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : undefined;
}
