// The modules of TanStack Start which the binding uses. The Vite plugin of
// this package resolves them to the packages of the project.
declare module 'flags:tanstack-start/server' {
  export function getRequest(): Request;
}

declare module 'flags:tanstack-start/router' {
  export function isRedirect(value: unknown): boolean;
  export function isNotFound(value: unknown): boolean;
}
