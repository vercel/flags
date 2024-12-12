# e2e tests

We run e2e tests for multiple versions of Next.js.

We run them for the latest release of every major release from Next.js 13 onwards.

Locally the tests run against the dev server. Playwright will either start the dev server or reuse an already running instance if there is one on the configured port.

In CI the tests run against the production server. We use `turbo.json` to first build and then start the server.

The test applications are not deployed anywhere to keep the action fast.

## Ports

The port of each application indicates the Next.js version

- next-13 runs on 4013
- next-13 runs on 4014
- next-15 runs on 4015
- sveltekit runs on 5173

## Developing locally

If you want to write or debug e2e tests for a specific Next.js version you can

Terminal 1

- `pnpm next-14`

Terminal 2

- `cd tests/next-14`
- `pnpm playwright test` or `pnpm playwright test --ui`
