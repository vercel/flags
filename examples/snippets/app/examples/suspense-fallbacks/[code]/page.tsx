import { coreFlags, hasAuthCookieFlag } from '../flags';
import { cookies, headers } from 'next/headers';
import Image from 'next/image';
import { generatePermutations } from 'flags/next';
import { Suspense } from 'react';

// opt into on parital prerendering for this page, which is necessary while
// it's experimental, see https://nextjs.org/learn/dashboard-app/partial-prerendering
// eslint-disable-next-line camelcase -- ok
export const experimental_ppr = true;

// prerender this page for all permutations of the flags
export async function generateStaticParams() {
  const permutations = await generatePermutations(coreFlags);
  return permutations.map((code) => ({ code }));
}

const delay = (ms = 700) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent dark:before:via-black/10 before:via-white/10 before:to-transparent`;

function AuthedUserSkeleton() {
  return (
    <div className="flex flex-row items-center gap-2">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
        <div
          className={`h-10 w-10 rounded-full bg-slate-300 dark:bg-slate-700 ${shimmer}`}
        />
      </div>

      <button
        type="submit"
        disabled
        className={`relative h-10 w-full items-center space-x-2 rounded-lg bg-slate-300 px-3 py-1 text-sm font-medium text-slate-300 dark:bg-slate-700 dark:text-slate-700 ${shimmer}`}
      >
        Sign out
      </button>
    </div>
  );
}

function AnonUser() {
  return (
    <form
      action={async function signIn() {
        'use server';
        const jar = await cookies();
        jar.set('suspense-fallbacks-user-id', '1', {
          maxAge: 1000 * 60 * 60,
        });
      }}
    >
      <button
        type="submit"
        className="relative h-10 w-full items-center space-x-2 rounded-lg bg-black px-3 py-1  text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70"
      >
        Sign in
      </button>
    </form>
  );
}

async function User() {
  const headersStore = await headers();
  const cookieStore = await cookies();

  // artificially delay the auth state to simulate resolving the user's auth,
  // but only if we are not hanlding a server action
  if (!headersStore.has('next-action')) await delay();

  if (cookieStore.get('suspense-fallbacks-user-id')?.value !== '1')
    return <AnonUser />;

  return (
    <div className="flex flex-row items-center gap-2">
      <div className="h-10 overflow-hidden">
        <Image
          src="/prince-akachi-LWkFHEGpleE-unsplash.jpg"
          className="rounded-full !my-0 h-10 inline-block"
          width={40}
          height={40}
          alt="User"
          priority
        />
      </div>

      <form
        action={async function signOut() {
          'use server';
          const jar = await cookies();
          jar.delete('suspense-fallbacks-user-id');
        }}
      >
        <button
          type="submit"
          className="relative h-10 w-full items-center space-x-2 rounded-lg bg-black px-3 py-1  text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const awaitedParams = await params;
  const hasAuthCookie = await hasAuthCookieFlag(awaitedParams.code, coreFlags);

  return (
    <>
      <div className="w-full max-w-4xl mx-auto p-4 bg-slate-100 dark:bg-slate-800 shadow-md rounded-lg my-4">
        <div className="flex justify-between items-center">
          <div className="text-xl font-semibold text-primary text-slate-800 dark:text-slate-100">
            My App
          </div>
          <Suspense
            fallback={hasAuthCookie ? <AuthedUserSkeleton /> : <AnonUser />}
          >
            <User />
          </Suspense>
        </div>
      </div>
      <p className="italic">
        Reload this page while signed in or signed out to see that the loading
        skeleton matches the predicted auth state.
      </p>
    </>
  );
}
