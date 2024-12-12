import {
  hasAuthCookieFlag,
  footerFlag,
  precomputeFlags,
} from '#/middleware-flags';
import { FlagValues } from '@vercel/flags/react';
import { deserialize } from '@vercel/flags/next';
import { Header } from '#/components/header';
import { encrypt } from '@vercel/flags';

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ variants: string }>;
}) {
  const params = await props.params;

  const { children } = props;

  // necessary so we can register all evaluted facets
  const flags = await deserialize(precomputeFlags, params.variants);
  const encryptedValues = await encrypt(flags);

  const hasAuthCookie = await hasAuthCookieFlag(
    params.variants,
    precomputeFlags,
  );
  const footer = await footerFlag(params.variants, precomputeFlags);

  return (
    <>
      <Header hasAuthCookie={hasAuthCookie} />
      {children}
      <footer className="text-center text-sm text-gray-600">
        <a href={footer.url} target="_blank">
          {footer.text}
        </a>
      </footer>
      <FlagValues values={encryptedValues} />
    </>
  );
}
