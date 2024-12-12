import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import { cookies, headers } from 'next/headers';
import Image from 'next/image';
import { Suspense } from 'react';
import { CartCount } from '#/components/cart-count';

const delay = (ms = 500) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent`;

async function CartCountFromCookies() {
  const cookieStore = await cookies();
  const cartCount = Number(cookieStore.get('_cart_count')?.value || '0');
  return <CartCount initialCartCount={cartCount} />;
}

export function AuthedUserSkeleton() {
  return (
    <>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
        <div className={`h-10 w-10 rounded-full bg-gray-900 ${shimmer}`} />
      </div>

      <div>
        <div className={`h-10 w-10 rounded-full bg-gray-900 ${shimmer}`} />
      </div>

      <button
        type="submit"
        disabled
        className={`relative h-10 w-full items-center space-x-2 rounded-lg bg-gray-900 px-3 py-1 text-sm font-medium text-gray-900 ${shimmer}`}
      >
        Sign out
      </button>
    </>
  );
}

export function AnonUserSkeleton() {
  return (
    <>
      <button
        disabled
        type="button"
        className={`relative h-10 w-full items-center space-x-2 rounded-lg bg-gray-900 px-3 py-1 text-sm font-medium text-gray-900 ${shimmer}`}
      >
        Sign in
      </button>
    </>
  );
}

export default async function User() {
  if (!(await headers()).has('next-action')) await delay(1000);
  const cookieStore = await cookies();
  return cookieStore.get('fake-auth-cookie')?.value === '1' ? (
    <>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
        <ShoppingCartIcon className="w-6 text-white" />
        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-vercel-cyan text-sm font-bold text-cyan-800">
          <Suspense fallback={<span></span>}>
            <CartCountFromCookies />
          </Suspense>
        </div>
      </div>

      <Image
        src="/prince-akachi-LWkFHEGpleE-unsplash.jpg"
        className="rounded-full"
        width={40}
        height={40}
        alt="User"
        priority
      />

      <form
        action={async function signOut() {
          'use server';
          const cookieStore = await cookies();
          cookieStore.delete('fake-auth-cookie');
        }}
      >
        <button
          type="submit"
          className="relative h-10 w-full items-center space-x-2 rounded-lg bg-black px-3 py-1  text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70"
        >
          Sign out
        </button>
      </form>
    </>
  ) : (
    <>
      <form
        action={async function signIn() {
          'use server';
          const cookieStore = await cookies();
          cookieStore.set('fake-auth-cookie', '1', {
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
    </>
  );
}
