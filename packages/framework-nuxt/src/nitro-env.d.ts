// The auto-imports of Nitro which the Nuxt binding uses. Nitro provides them in
// the build of the application.
declare module '#imports' {
  interface H3Event {
    readonly headers: Headers;
  }
  export function useEvent(): H3Event;
  export function getRequestURL(event: H3Event): URL;
  export function isError(value: unknown): boolean;
  export function defineNitroPlugin(
    plugin: (nitroApp: {
      hooks: { hook(name: 'close', callback: () => unknown): void };
    }) => void,
  ): unknown;
}
