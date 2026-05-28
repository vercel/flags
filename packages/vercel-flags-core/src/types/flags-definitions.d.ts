declare module '@vercel/flags-definitions' {
  export function get(hashedSdkKey: string): Record<string, unknown> | null;
  export const version: string;
}
