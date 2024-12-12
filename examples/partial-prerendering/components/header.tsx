import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { Suspense } from 'react';
import { NextLogo } from '#/components/next-logo';
import User, { AnonUserSkeleton, AuthedUserSkeleton } from '#/components/user';

export function Header({ hasAuthCookie }: { hasAuthCookie: boolean }) {
  return (
    <div className="flex items-center justify-between gap-x-3 rounded-lg bg-gray-800 px-3 py-3 lg:px-5 lg:py-4">
      <div className="flex gap-x-3">
        <div className="h-10 w-10 hover:opacity-70">
          <NextLogo />
        </div>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-300" />
          </div>
          <input
            aria-label="Search"
            type="search"
            name="search"
            id="search"
            className="block w-full rounded-full border-none bg-gray-600 pl-10 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex shrink-0 gap-x-3">
        <Suspense
          fallback={
            hasAuthCookie ? <AuthedUserSkeleton /> : <AnonUserSkeleton />
          }
        >
          <User />
        </Suspense>
      </div>
    </div>
  );
}
