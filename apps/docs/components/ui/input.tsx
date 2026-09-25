import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-gray-alpha-400 bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-gray-1000 selection:text-background-100 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-gray-1000 file:text-sm placeholder:text-gray-800 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-gray-alpha-400/30',
        'focus-visible:border-gray-600 focus-visible:ring-[3px] focus-visible:ring-gray-600/50',
        'aria-invalid:border-red-800 aria-invalid:ring-red-800/20 dark:aria-invalid:ring-red-800/40',
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
