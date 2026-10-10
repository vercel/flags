import { newCheckout } from '../../flags';

// Rendered at build time: there is no request, so the user is "anonymous"
export const dynamic = 'force-static';

export default async function StaticPage() {
  return <p id="static-checkout">{String(await newCheckout())}</p>;
}
