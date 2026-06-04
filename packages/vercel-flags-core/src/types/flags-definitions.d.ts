declare module '@vercel/flags-definitions' {
  export function get(key: string): Record<string, unknown> | null;
  export const version: string;
}
