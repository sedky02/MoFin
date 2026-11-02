export const TOKENS: string[];
export function toRgb(value: string, backdrop?: number[]): number[];
export function toHslTriplet(rgb: number[]): string;
export function hslTripletToRgb(triplet: string): number[];
export function parseWebTokens(css: string): {
  light: Record<string, number[]>;
  dark: Record<string, number[]>;
  radius: string;
};
export function build(): { css: string; colors: string };
