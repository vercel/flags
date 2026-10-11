// The module of SvelteKit which the binding uses. SvelteKit provides it in
// the build of the application.
declare module '$app/server' {
  export function getRequestEvent(): { request: Request; url: URL };
}
