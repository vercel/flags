'use client';

import { clsx } from 'clsx';
import { Popover } from '@headlessui/react';
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { EuFlag } from './eu-flag';
import { navigation } from '@/app/data';

export function Header() {
  return (
    <header className="relative bg-white">
      <nav aria-label="Top" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200">
          <div className="flex h-16 items-center justify-between">
            <div className="flex flex-1 items-center lg:hidden">
              <button
                type="button"
                className="-ml-2 rounded-md bg-white p-2 text-gray-400"
              >
                <span className="sr-only">Open menu</span>
                <Bars3Icon className="h-6 w-6" aria-hidden="true" />
              </button>

              <a
                href="#"
                className="ml-2 p-2 text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Search</span>
                <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
              </a>
            </div>

            {/* Flyout menus */}
            <Popover.Group className="hidden lg:block lg:flex-1 lg:self-stretch">
              <div className="flex h-full space-x-8">
                {navigation.categories.map((category) => (
                  <Popover key={category.name} className="flex">
                    {({ open }) => (
                      <>
                        <div className="relative flex">
                          <Popover.Button
                            className={clsx(
                              open
                                ? 'text-slate-600'
                                : 'text-gray-700 hover:text-gray-800',
                              'relative z-10 flex items-center justify-center text-sm font-medium transition-colors duration-200 ease-out',
                            )}
                          >
                            {category.name}
                            <span
                              className={clsx(
                                open ? 'bg-slate-600' : '',
                                'absolute inset-x-0 bottom-0 h-0.5 transition-colors duration-200 ease-out sm:mt-5 sm:translate-y-px sm:transform',
                              )}
                              aria-hidden="true"
                            />
                          </Popover.Button>
                        </div>
                      </>
                    )}
                  </Popover>
                ))}
              </div>
            </Popover.Group>

            {/* Logo */}
            <a href="#" className="flex">
              <span className="sr-only">Your Company</span>
              <ShoppingBagIcon className="h-8 w-auto" />
            </a>

            <div className="flex flex-1 items-center justify-end">
              <a
                href="#"
                className="hidden text-gray-700 hover:text-gray-800 lg:flex lg:items-center"
              >
                <EuFlag className="block h-auto w-5 flex-shrink-0" />
                <span className="ml-3 block text-sm font-medium">EUR</span>
                <span className="sr-only">, change currency</span>
              </a>

              {/* Search */}
              <a
                href="#"
                className="ml-6 hidden p-2 text-gray-400 hover:text-gray-500 lg:block"
              >
                <span className="sr-only">Search</span>
                <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
              </a>

              {/* Account */}
              <a
                href="#"
                className="p-2 text-gray-400 hover:text-gray-500 lg:ml-4"
              >
                <span className="sr-only">Account</span>
                <UserIcon className="h-6 w-6" aria-hidden="true" />
              </a>

              {/* Cart */}
              <div className="ml-4 flow-root lg:ml-6">
                <a href="#" className="group -m-2 flex items-center p-2">
                  <ShoppingCartIcon
                    className="h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700 group-hover:text-gray-800">
                    0
                  </span>
                  <span className="sr-only">items in cart, view bag</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
