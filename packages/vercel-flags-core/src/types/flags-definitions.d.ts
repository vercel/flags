declare module '@vercel/flags-definitions/definitions.json' {
  const definitions: unknown;
  export default definitions;
}

declare module '@vercel/flags-definitions' {
  export function get(hashedSdkKey: string): Record<string, unknown> | null;
  export const version: string;
}
