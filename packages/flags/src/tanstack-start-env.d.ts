// The server module of TanStack Start which the binding uses. The Vite
// plugin resolves it from the project.
declare module 'flags:tanstack-start/server' {
  export function getRequest(): Request;
}
