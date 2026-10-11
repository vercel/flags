/**
 * The conformance suite of the Flags SDK standard (section 11 of
 * STANDARD.md). It checks a framework binding in a running application over
 * HTTP.
 *
 * The application serves one route:
 *
 * ```ts
 * // GET /conformance
 * import { conformanceResult } from '@flags-sdk/conformance';
 *
 * export async function GET() {
 *   return Response.json(await conformanceResult());
 * }
 * ```
 *
 * A test runner makes one test of each check:
 *
 * ```ts
 * for (const check of conformanceChecks) {
 *   test(check.name, () => check.run(options));
 * }
 * ```
 */
import { readFile } from 'node:fs/promises';
import {
  defineConnection,
  defineFlag,
  encryptOverrides,
  evaluate,
} from 'flags';
import { validateFlagsManifest } from 'flags/manifest';

interface ConformanceState {
  readonly calls: Map<string, number>;
  signal?: () => unknown;
}

// On globalThis, because a framework can load this module in more than one
// bundle, e.g. Next.js
const store = globalThis as { __flagsConformance?: ConformanceState };
store.__flagsConformance ??= { calls: new Map() };
const state = store.__flagsConformance;

/**
 * Registers the signal of the framework, which the suite expects as a
 * response with the status 307, e.g. `() => redirect(307, '/')`. The
 * function can throw the signal, or return it.
 */
export function setConformanceSignal(signal: () => unknown): void {
  state.signal = signal;
}

/**
 * The connection of the suite. Its provider returns the evaluation context
 * which it receives, so the suite sees what the binding gives the SDK.
 */
export const conformanceConnection = defineConnection({
  provider: {
    metadata: { name: 'flags-conformance' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
    resolveStringEvaluation: async (_key, _defaultValue, context) => ({
      value: JSON.stringify(context),
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (_context, request) => {
    if (request?.headers?.get('x-conformance-signal') && state.signal) {
      throw state.signal();
    }
    const requestId = request?.headers?.get('x-conformance-request') ?? null;
    if (requestId) {
      state.calls.set(requestId, (state.calls.get(requestId) ?? 0) + 1);
    }
    return {
      requestId,
      user: request?.cookies?.get('conformance-user')?.value ?? null,
      header: request?.headers?.get('x-conformance-header') ?? null,
      path: request?.url?.pathname ?? null,
    };
  },
});

export const conformanceContext = defineFlag(
  conformanceConnection,
  'conformance-context',
  '',
);
export const conformanceEnabled = defineFlag(
  conformanceConnection,
  'conformance-enabled',
  false,
);

/**
 * What the route `GET /conformance` returns.
 */
export interface ConformanceResult {
  readonly context: {
    readonly requestId: string | null;
    readonly user: string | null;
    readonly header: string | null;
    readonly path: string | null;
  };
  readonly enabled: boolean;
  /**
   * How often the connection created the evaluation context in this
   * request.
   */
  readonly contextCalls: number | null;
}

/**
 * Evaluates the flags of the suite, two times, in the current request.
 */
export async function conformanceResult(): Promise<ConformanceResult> {
  const [context, enabled] = await evaluate([
    conformanceContext,
    conformanceEnabled,
  ]);
  // The same flags again, in the same request
  await conformanceContext();
  await conformanceEnabled();
  const parsed = JSON.parse(context) as ConformanceResult['context'];
  return {
    context: parsed,
    enabled,
    contextCalls: parsed.requestId
      ? (state.calls.get(parsed.requestId) ?? 0)
      : null,
  };
}

export interface ConformanceOptions {
  /**
   * The origin of the running application, e.g. `http://localhost:3000`.
   */
  readonly baseURL: string;
  /**
   * The path of the route of the suite. The default is `/conformance`.
   */
  readonly path?: string;
  /**
   * `FLAGS_SECRET` of the application. With it, the suite checks an
   * override cookie.
   */
  readonly flagsSecret?: string;
  /**
   * Whether the application registered a signal with
   * `setConformanceSignal`. Only for frameworks with signals.
   */
  readonly signal?: boolean;
  /**
   * Whether the application runs in development, so that it serves the
   * manifest at `/.well-known/flags/manifest.json`.
   */
  readonly devManifest?: boolean;
  /**
   * The file of the manifest of the build, e.g. `.next/flags-manifest.json`.
   */
  readonly manifestFile?: string;
  /**
   * Whether the binding gives the URL of the request. The default is
   * `true`. A framework which does not know the URL in all places, e.g.
   * Next.js in server components, sets `false` (STANDARD.md, section 3.1).
   */
  readonly url?: boolean;
  readonly fetch?: typeof fetch;
}

export interface ConformanceCheck {
  /**
   * The name, with the section of STANDARD.md.
   */
  readonly name: string;
  /**
   * Whether the check applies, e.g. not without `flagsSecret`.
   */
  applies(options: ConformanceOptions): boolean;
  /**
   * Throws an error which tells what does not conform.
   */
  run(options: ConformanceOptions): Promise<void>;
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Does not conform: ${message}`);
}

async function request(
  options: ConformanceOptions,
  init: { cookie?: string; headers?: Record<string, string> } = {},
): Promise<ConformanceResult> {
  const send = options.fetch ?? fetch;
  const response = await send(
    new URL(options.path ?? '/conformance', options.baseURL),
    {
      headers: {
        'x-conformance-request': crypto.randomUUID(),
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
    },
  );
  expect(
    response.ok,
    `GET ${options.path ?? '/conformance'} returned ${response.status}.`,
  );
  return (await response.json()) as ConformanceResult;
}

const always = () => true;

export const conformanceChecks: readonly ConformanceCheck[] = [
  {
    name: '3.1 gives the headers, the cookies and the URL of the request',
    applies: always,
    async run(options) {
      const result = await request(options, {
        cookie: 'conformance-user=alice',
        headers: { 'x-conformance-header': 'from-the-request' },
      });
      expect(
        result.context.user === 'alice',
        'the cookie of the request is not in the evaluation context.',
      );
      expect(
        result.context.header === 'from-the-request',
        'the header of the request is not in the evaluation context.',
      );
      if (options.url !== false) {
        expect(
          result.context.path === (options.path ?? '/conformance'),
          'the URL of the request is not in the evaluation context.',
        );
      }
      expect(result.enabled, 'the flag did not get the evaluation context.');
    },
  },
  {
    name: '3.2 creates the evaluation context one time for each request',
    applies: always,
    async run(options) {
      const result = await request(options);
      expect(
        result.contextCalls === 1,
        `the evaluation context was created ${result.contextCalls} times in one request. The headers of one request must be the same object.`,
      );
    },
  },
  {
    name: '3.2 keeps the requests apart',
    applies: always,
    async run(options) {
      const users = ['alice', 'bob', 'carol', 'dave'];
      const results = await Promise.all(
        users.map((user) =>
          request(options, { cookie: `conformance-user=${user}` }),
        ),
      );
      results.forEach((result, index) => {
        expect(
          result.context.user === users[index],
          'a request got the evaluation context of an other request.',
        );
      });
    },
  },
  {
    name: '5.2 lets a signal of the framework through',
    applies: (options) => options.signal === true,
    async run(options) {
      const send = options.fetch ?? fetch;
      const response = await send(
        new URL(options.path ?? '/conformance', options.baseURL),
        { headers: { 'x-conformance-signal': '1' }, redirect: 'manual' },
      );
      expect(
        response.status === 307,
        `the signal did not reach the framework: the status is ${response.status}, not 307.`,
      );
    },
  },
  {
    name: '10.1 applies an override cookie',
    applies: (options) => options.flagsSecret !== undefined,
    async run(options) {
      const token = await encryptOverrides(
        { 'conformance-enabled': true },
        options.flagsSecret,
      );
      const result = await request(options, {
        cookie: `flag-overrides=${token}`,
      });
      expect(result.enabled, 'the override cookie was not applied.');
    },
  },
  {
    name: '7.2 serves the manifest in development',
    applies: (options) => options.devManifest === true,
    async run(options) {
      const send = options.fetch ?? fetch;
      const response = await send(
        new URL('/.well-known/flags/manifest.json', options.baseURL),
      );
      expect(response.ok, `the manifest returned ${response.status}.`);
      expect(
        response.headers.get('cache-control') === 'no-store',
        'the manifest must have cache-control: no-store.',
      );
      expect(
        (response.headers.get('content-type') ?? '').includes(
          'application/json',
        ),
        'the manifest must have content-type: application/json.',
      );
      validateFlagsManifest(await response.json());
    },
  },
  {
    name: '7.2 writes the manifest into the build',
    applies: (options) => options.manifestFile !== undefined,
    async run(options) {
      const file = await readFile(options.manifestFile as string, 'utf8');
      validateFlagsManifest(JSON.parse(file));
    },
  },
];

/**
 * Runs all checks which apply, and returns their results.
 */
export async function runConformance(
  options: ConformanceOptions,
): Promise<{ name: string; error?: unknown }[]> {
  const results = [];
  for (const check of conformanceChecks) {
    if (!check.applies(options)) continue;
    try {
      await check.run(options);
      results.push({ name: check.name });
    } catch (error) {
      results.push({ name: check.name, error });
    }
  }
  return results;
}
