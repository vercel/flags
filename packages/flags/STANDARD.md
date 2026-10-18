# The Flags SDK standard

Version 1, draft.

This document is the contract between the Flags SDK and four kinds of
implementers: frameworks, deployment platforms, flag management systems,
and tools. An implementation which follows it works with each other
implementation which follows it.

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD
NOT, RECOMMENDED, MAY and OPTIONAL are to be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when,
they appear in all capitals.

The provider contract is not part of this standard: it is
[OpenFeature](https://openfeature.dev/specification/). The working notes of
the SDK are in [SPEC.md](./SPEC.md). The guide for implementers is
[FRAMEWORK-AUTHORS.md](./FRAMEWORK-AUTHORS.md).

## 1. Terminology

- **Flag management system (system):** the source of truth of the flags,
  as defined by OpenFeature, e.g. LaunchDarkly or Vercel Flags.
- **Provider:** an OpenFeature provider of a system.
- **Connection:** a provider plus a flag project in a system.
- **Deployment platform (platform):** where the application runs, e.g.
  Vercel. A **platform project** has many **deployments**.
- **Framework binding (binding):** the module which connects the SDK to one
  framework.
- **Build plugin:** the part of a framework integration which configures the
  bundler.
- **The runtime:** the object `runtime` of the package `flags`.
- **Flags manifest:** the JSON description of the flags of an application.
- **System manifest:** the JSON file of a system with the templates of the
  links to its dashboard.

## 2. Conformance

An implementation conforms to one or more of these classes:

| Class | Implemented by | Sections |
| --- | --- | --- |
| Framework binding | a framework, or its package `@flags-sdk/<framework>` | 3, 4, 5, 6 |
| Build plugin | a framework with a bundler | 4, 7 |
| Deployment platform | e.g. Vercel | 4.3, 8, 11.3 |
| Flag management system | e.g. LaunchDarkly | 9 |
| Tool | e.g. Flags Explorer | 7.3, 9.2, 10, 11 |

A framework binding SHOULD pass the conformance suite
`@flags-sdk/conformance` (section 12).

## 3. The request

### 3.1 `FlagsRequestInit`

A framework gives the runtime the current request as a `FlagsRequestInit`:

```ts
interface FlagsRequestInit {
  readonly headers?: ReadonlyHeaders; // e.g. the Headers of a Web Request
  readonly cookies?: ReadonlyRequestCookies; // get, getAll, has
  readonly url?: string | URL;
}
```

- A framework MUST give each property which it knows, and MAY omit the
  others.
- `headers` MUST implement `get`, `has`, `entries`, `forEach`, `keys` and
  `values` of the Web `Headers` interface.
- `cookies`, if given, MUST implement `get(name)`, `getAll()` and
  `has(name)`, where `get` returns `{ name, value }` or `undefined`. Without
  `cookies`, the runtime reads the `Cookie` header.
- `url`, if given, MUST be the full URL of the request, with the origin.
- A Web `Request` is a `FlagsRequestInit`.

### 3.2 The identity of a request

The runtime creates the evaluation context, and evaluates each flag, one
time for each request and input.

- A framework which gives the request through a request source (section
  5.1) MUST return the same `headers` object during one request, and a
  different object for each other request. Without `headers`, it MUST
  return the same `FlagsRequestInit` object during one request.
- A framework MUST NOT give the request of one request during an other
  request.

## 4. The replaceable modules

The runtime imports three modules through the name of its own package. A
build plugin or a platform replaces them.

| Module | Default | Replaced by |
| --- | --- | --- |
| `flags/framework` | no binding | the framework binding (section 5) |
| `flags/config` | no configuration | `flags.config.ts` of the application (section 6) |
| `flags/default-provider` | the OFREP provider of Vercel Flags | the provider of a platform (section 8) |

### 4.1 Replacement

- An implementation which replaces a module MUST make the replacement
  reach the runtime, e.g. by bundling the package `flags` into the server
  code.
- An implementation MUST resolve a replacement from the project of the
  application, not from the package `flags`.
- If the runtime is not bundled, e.g. because the framework loads it from
  `node_modules` in development, a binding MUST register itself with
  `registerFramework` of `flags/tooling` before the first evaluation.
- If more than one binding is registered, the runtime uses the first.

### 4.2 Several copies of the SDK

- The runtime MUST share its state between all copies of the same major
  version in one process, through `globalThis` under
  `Symbol.for('flags.v5.state')`.
- A copy without a binding MUST NOT hide the binding of an other copy.

### 4.3 `flags/default-provider`

The module MUST export:

```ts
export function createDefaultProvider(): Provider; // an OpenFeature provider
```

- The runtime calls it at most one time for each process.
- The provider MUST NOT be registered with the OpenFeature API.

## 5. The framework binding

The module behind `flags/framework` MUST export:

```ts
export const setupFramework: SetupFramework; // (runtime: Runtime) => void | Promise<void>
```

- The runtime calls `setupFramework` one time, before the first
  evaluation. If it fails, the evaluation fails, and the runtime calls it
  again at the next evaluation.
- The binding MUST NOT import the package `flags` at runtime. It MAY import
  its types.
- The binding MUST use only the public API of `flags`.

### 5.1 The request source

A framework which can give the current request at any time, but has no
middleware which wraps the handler, MUST call
`runtime.setRequestSource(source)`.

- `source()` MUST return the current `FlagsRequestInit`, or `undefined`
  outside of a request. It MAY return a promise.
- `source()` MUST NOT throw outside of a request.
- `source()` MUST throw the signals of the framework (section 5.2)
  unchanged.

A framework with a middleware which wraps the handler MAY call
`runtime.onInvoke(request, next)` instead. Inside `onInvoke`, the runtime
does not call the source.

### 5.2 Signals

Some frameworks control the flow of a request with thrown values, e.g. a
redirect. These are **signals**.

- A framework with signals MUST call `runtime.setRethrow(rethrow)`.
- `rethrow(error)` MUST throw `error` again if it is a signal, or the
  error of a cache scope (section 5.4), and MUST return otherwise.
- The runtime calls `rethrow` before it uses the default value of a flag.
  Thus, a signal from a provider or from a step of the evaluation context
  chain reaches the framework unchanged.
- A binding SHOULD recognize signals with the functions of the framework,
  e.g. `isRedirect()`, and MUST use the same copy of the framework as the
  application.

### 5.3 The config source

A framework with a bundler MUST call `runtime.setConfigSource(source)`,
where `source` returns the export `config` of `flags/config`.

- In development, the runtime calls the source before each evaluation, and
  applies a new configuration. In production, it calls it one time.

### 5.4 Rendering and caches

A flag value can change at any time, and depends on the request. Thus, an
evaluation belongs to the request.

- If the framework prerenders, the binding MUST make an evaluation part of
  the render at request time, e.g. with `connection()` of Next.js. Thus, a
  provider can read the time or do I/O.
- A precomputed value does not use the request. It MAY be prerendered.
- A binding MUST NOT let an evaluation run in a cache scope of the
  framework, e.g. `'use cache'` of Next.js, if it can recognize one. The
  request source MUST throw an error there, and `rethrow` MUST throw it
  again, so that the flag does not return its default value. The
  application evaluates the flag outside, and passes the value into the
  cache scope.

## 6. `flags.config.ts`

- The file MUST be named `flags.config.ts`, `flags.config.mts`,
  `flags.config.js` or `flags.config.mjs`, in the directory of the
  application or in its `src` directory.
- The configuration MUST be the named export `config`. A default export
  MUST NOT be read.
- A framework without a bundler MUST let the application give the
  configuration, e.g. as an option of a middleware, and give it to
  `runtime.configure(config)`.

## 7. Discovery

### 7.1 `'use flags'` modules

A **flags module** starts with the directive `'use flags'` in its
directive prologue.

- Each export of a flags module MUST be a flag: an object or a function
  with a non-empty string `key`.
- Importing a flags module MUST NOT have side effects other than the
  definition of flags and connections. It MUST NOT open network
  connections.
- A build plugin SHOULD append a registration to each flags module, which
  calls `registerFlags` with the exports of the module
  (`addSelfRegistration` of `flags/tooling`).
- A build plugin MUST NOT examine more than the directive prologue to find
  the directive.

### 7.2 The manifest of an application

A build plugin which supports discovery:

- MUST find all flags modules of the project, also of routes which are not
  loaded, and import them with the bundler of the framework;
- MUST create the manifest with `createManifest` of `flags/manifest`, after
  `runtime.prepare()`;
- in development, MUST serve it at `/.well-known/flags/manifest.json`, with
  `content-type: application/json` and `cache-control: no-store`;
- MUST NOT serve it in production;
- after a build, MUST write it as `flags-manifest.json` into the directory
  of the server output;
- MUST NOT evaluate flags to create it.

### 7.3 The format

The manifest MUST conform to the JSON Schema
`https://flags-sdk.dev/schemas/flags-manifest.v1.json`:

```json
{
  "version": 1,
  "connections": {
    "launchdarkly": {
      "system": "launchdarkly",
      "systemManifest": "https://flags-sdk.dev/system-manifests/launchdarkly.json",
      "variables": { "projectId": "shop", "environment": "production" }
    }
  },
  "definitions": {
    "summer-sale": {
      "type": "boolean",
      "defaultValue": false,
      "description": "The summer sale",
      "declaredInCode": true,
      "connection": "launchdarkly",
      "sources": [{ "module": "flags.ts", "export": "summerSale" }]
    }
  }
}
```

- `definitions` MUST be sorted by key.
- `variables` MUST contain only public identifiers, never credentials.
- The manifest MUST NOT contain the values of flags.
- A tool MUST ignore fields which it does not know.

## 8. Deployment platforms

- A platform MAY replace `flags/default-provider` with its own provider,
  for its builds. It MUST NOT replace it for development.
- A `defaultConnection` of `flags.config.ts` MUST win over the provider of
  the platform. The runtime does this.
- A platform SHOULD put `flags-manifest.json` of the build into its build
  output, so that tools can read it.
- A platform which signs override tokens MUST follow section 10.

## 9. Flag management systems

### 9.1 Registration

A system is known to the SDK by an ID, e.g. `launchdarkly`, with the fields
of its flag project. A system adds itself with a change to
`ProjectFieldsBySystem` and `systemManifestUrls` of the SDK.

- The fields of a flag project MUST be public identifiers, never
  credentials.

### 9.2 The system manifest

A system SHOULD publish a system manifest, which conforms to the JSON
Schema `https://flags-sdk.dev/schemas/system-manifest.v1.json`.

- The URL templates MUST use level 1 of RFC 6570.
- A template MUST be an HTTPS URL, and MUST NOT have a placeholder in its
  origin, credentials or a fragment.
- Templates SHOULD use stable identifiers, e.g. IDs, not names which can
  change. A dashboard whose URLs contain names SHOULD accept the IDs in
  the same place.
- A tool MUST URL-encode each value, and MUST NOT show a link of which a
  variable is not known.

## 10. Overrides

An override sets the value of a flag for one browser, with a cookie.

### 10.1 Shared secret

- The cookie is `flag-overrides`. Its value is a JWE with the algorithm
  `dir` and the encryption `A256GCM`, with the key `FLAGS_SECRET` (32 bytes,
  base64url).
- The payload MUST have the claim `pur` with the value `overrides`, the
  claim `o` with an object of flag keys and values, and MAY have `exp`.
- If `FLAGS_SECRET` is set, the runtime MUST accept only this kind.

### 10.2 Signed by the platform

- The cookie is `vercel-flag-overrides`. Its value is a JWS with `ES256` or
  `RS512`, signed by a key of the issuer of the platform.
- The protected header MUST have a `kid` of a key in the key set of the
  issuer. The runtime MUST reject a token with `jwk`, `jku`, `x5u` or
  `crit` in its header.
- The payload MUST have `iss` with the issuer, exactly as the runtime
  knows it.
- The payload MUST have `aud` with `vercel:flag-overrides`, `pur` with
  `flag-overrides`, `ver` with `1`, the integers `iat` and `exp`, the
  object `overrides` with flag keys and values, and the object `scope`
  with `projectId`, `environments` (a non-empty list) and an optional
  `teamId`.
- The runtime reads `flag-overrides` before `vercel-flag-overrides`. Thus,
  a tool which writes one of them SHOULD delete the other.
- The runtime MUST reject a token of an other platform project, of an
  environment which is not in `environments`, with a scope which has
  other fields, or with a lifetime (`exp` minus `iat`) longer than the
  maximum (24 hours by default).

### 10.3 Both kinds

- A value of an override which does not fit the type or the options of
  its flag MUST be ignored.
- An evaluation with an override MUST have the reason `OVERRIDE` in its
  evaluation details, and runs all hooks.

## 11. Flag values in the page

A page can contain the values of its flags, so that a tool can show them,
e.g. Flags Explorer, or send them to an analytics service of the platform.

### 11.1 The element

```html
<script type="application/json" data-flag-values>…</script>
```

- The content MUST be JSON: an object of flag keys and values (the plain
  form), or a string, which is a token of section 11.2 or 11.3.
- The content MUST have each `<` escaped as `\u003c`. Thus, the content
  can not end the element. `serializeFlagValues` of `flags` does this.
- A page MAY have more than one element. A tool MUST merge them in the
  order of the document. A later value of a flag replaces an earlier one.
- The plain form shows the values to each visitor. An implementation MUST
  NOT use it unless the application selects it.

### 11.2 Shared secret

- The format of v4: a JWE with the algorithm `dir` and the encryption
  `A256GCM`, with the key `FLAGS_SECRET`.
- The payload MUST have the claim `pur` with the value `values`, and the
  claim `v` with the object of flag keys and values. It MAY have `exp`.
- If `FLAGS_SECRET` is set, an implementation SHOULD use this form, unless
  the application selects a different form.

### 11.3 Encrypted for the platform

- A JWE with the algorithm `ECDH-ES` and the encryption `A256GCM`, with a
  public key of the platform (P-256). The protected header MUST have the
  `kid` of the key.
- The platform publishes its public keys as a JWK Set. The set MUST NOT
  contain private or secret keys. The implementation MUST use the first
  key with `kty` `EC`, `crv` `P-256`, and, if they are present, `use` `enc`
  and `alg` `ECDH-ES`.
- The payload MUST have `aud` with `vercel:flag-values`, `pur` with
  `flag-values`, `ver` with `1`, the integer `iat`, and `values` with the
  object of flag keys and values. It SHOULD have `scope` with the
  `projectId`, the `environment` and, if it is known, the `teamId` of the
  platform project. It MAY have `exp`.
- Only the platform can decrypt the token. The token gives no
  authenticity: each visitor can encrypt other values with the public key.
  A receiver MUST NOT trust the values for decisions, e.g. for access.
- A token can be part of a static page, e.g. of a precomputed page, for the
  lifetime of a deployment. Thus, the platform SHOULD keep a private key
  for decryption after it stops publishing the key, as long as deployments
  can contain tokens of it.

## 12. The conformance suite

`@flags-sdk/conformance` checks a framework binding in a running
application over HTTP. The application MUST:

- serve `GET /conformance` with the JSON of `conformanceResult()` of the
  suite;
- for a framework with signals, register a signal with
  `setConformanceSignal`, which the suite expects as a response with the
  status 307.

The suite checks sections 3, 5 and 10.1, and optionally 7.2. See
[the README of the suite](../conformance/README.md).

## 13. Versioning

- This is version 1 of the standard. The manifest formats have their own
  `version`.
- A change which makes a conforming implementation not conform is a new
  major version of the standard and of the package `flags`.
