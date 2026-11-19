import {
  'fake-hat-checkout-experiment' as checkout,
  flag0,
  'test-string' as offer,
  'test-object-flag' as settings,
} from 'flags:site';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import catalog from '../.flags/catalog.json';
import ExampleFeature from './example-feature';

async function changeVisitor(formData: FormData) {
  'use server';

  const id = formData.get('visitor');
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error(
      'Use a visitor ID with 1–64 letters, digits, dashes, or underscores.',
    );
  }
  (await cookies()).set('demo-visitor', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  redirect('/');
}

/**
 * Whether the variant of the checkout experiment shows free shipping. The
 * provider can return a variant which the code does not know yet, so the
 * page checks the shape.
 */
function showsFreeShipping(variant: unknown): boolean {
  const params = (variant as { params?: unknown } | null)?.params;
  return (
    typeof params === 'object' &&
    params !== null &&
    (params as { displayFreeShippingLabel?: unknown })
      .displayFreeShippingLabel === true
  );
}

function variantIdOf(variant: unknown): string {
  const id = (variant as { variantId?: unknown } | null)?.variantId;
  return typeof id === 'string' ? id : 'unknown';
}

export default async function Home() {
  // All four flags share one evaluation context of the source in this
  // request: getEvaluationContext runs once.
  const [enabled, checkoutVariant, currentOffer, configuration] =
    await Promise.all([flag0(), checkout(), offer(), settings()]);
  const visitor = (await cookies()).get('demo-visitor')?.value ?? 'visitor-1';

  return (
    <main>
      <nav aria-label="Demo">
        <Link className="wordmark" href="/">
          ⚑ Flags <span>/</span> Playground
        </Link>
        <span className="badge">
          <span className="status-dot" />
          Server evaluated
        </span>
      </nav>

      <header className="hero">
        <p className="eyebrow">A flag is an import.</p>
        <h1>
          Connect once.
          <br />
          Call it anywhere.
        </h1>
        <p className="lede">
          Your provider supplies the flags. Your connection supplies the
          context. Your application makes the call.
        </p>
      </header>

      <section className="code-panel" aria-label="Application code">
        <div className="panel-label">
          <span>app/page.tsx</span>
          <span>Server Component</span>
        </div>
        <pre>
          <code>
            <span className="code-keyword">import</span>
            {' { flag0 } '}
            <span className="code-keyword">from</span>{' '}
            <span className="code-string">&apos;flags:site&apos;</span>
            {';\n\n'}
            <span className="code-keyword">const</span>
            {' enabled = '}
            <span className="code-keyword">await</span>
            {' flag0();'}
          </code>
        </pre>
        <div className="code-result">
          <span>Returned value</span>
          <strong data-testid="flag0">{String(enabled)}</strong>
        </div>
      </section>

      <section
        className="evaluation-section"
        aria-labelledby="example-feature-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conditional rendering</p>
            <h2 id="example-feature-title">A feature you can switch.</h2>
          </div>
          <span className="connection-label">app/example-feature.tsx</span>
        </div>
        <ExampleFeature />
        <p className="lede">
          Change <code>enable-example-feature</code> in Vercel Flags, then
          reload this page. The Server Component evaluates the flag for the
          current visitor.
        </p>
      </section>

      <section
        className="evaluation-section"
        aria-labelledby="evaluation-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">The current request</p>
            <h2 id="evaluation-title">Same connection. One context.</h2>
          </div>
          <span className="connection-label">flags:site</span>
        </div>
        <div className="context-panel">
          <form action={changeVisitor} className="visitor-form">
            <label htmlFor="visitor">Visitor ID</label>
            <div className="input-row">
              <input
                id="visitor"
                name="visitor"
                defaultValue={visitor}
                pattern="[a-zA-Z0-9_-]{1,64}"
                maxLength={64}
                required
              />
              <button type="submit">
                Evaluate <span aria-hidden="true">↗</span>
              </button>
            </div>
            <p>
              The connection sets both <code>user.id</code> and{' '}
              <code>visitor.id</code>.
            </p>
          </form>
        </div>
        <div className="results-grid">
          <article className="result-card">
            <div className="card-label">
              Experiment <span>01</span>
            </div>
            <h3>fake-hat-checkout-experiment</h3>
            <p className="flag-value" data-testid="shipping">
              {showsFreeShipping(checkoutVariant)
                ? 'Free shipping'
                : 'Standard shipping'}
            </p>
            <p className="card-note">
              Variant {variantIdOf(checkoutVariant)}. Change the visitor ID to
              test assignment.
            </p>
          </article>
          <article className="result-card">
            <div className="card-label">
              String union <span>02</span>
            </div>
            <h3>test-string</h3>
            <p className="flag-value" data-testid="offer">
              {currentOffer}
            </p>
            <p className="card-note">
              The return type comes from the provider&apos;s variants.
            </p>
          </article>
          <article className="result-card">
            <div className="card-label">
              Object <span>03</span>
            </div>
            <h3>test-object-flag</h3>
            <pre className="json-value" data-testid="settings">
              {JSON.stringify(configuration, null, 2)}
            </pre>
            <p className="card-note">
              An object flag. A flag whose variants mix types, e.g. objects and
              null, is not generated, because OpenFeature evaluates each flag
              with one type.
            </p>
          </article>
        </div>
      </section>

      <section
        className="connection-section"
        aria-labelledby="connection-title"
      >
        <div>
          <p className="eyebrow">One place to connect</p>
          <h2 id="connection-title">No flag declarations.</h2>
          <p>
            Every export is generated from Vercel Flags. Unknown imports fail
            the type check. Evaluations run through{' '}
            <code>@vercel/flags-core</code>.
          </p>
        </div>
        <pre>
          <code>{`// flags/sources/site/context.ts
import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  _input: unknown,
  request: FlagsRequest | undefined,
) {
  const id = request?.cookies?.get('demo-visitor')?.value
    ?? 'visitor-1';
  return { user: { id }, visitor: { id } };
}`}</code>
        </pre>
      </section>

      <footer>
        <span>Next.js × Vercel Flags</span>
        <span>
          {catalog.site.flags} available flags <span aria-hidden="true">·</span>{' '}
          Catalog revision {catalog.site.revision}
        </span>
      </footer>
    </main>
  );
}
