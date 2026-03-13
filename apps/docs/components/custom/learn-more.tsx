import Link from 'next/link';
import type { HTMLAttributeAnchorTarget } from 'react';
import { cn } from '@/lib/utils';

function Hash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={16}
      fill="none"
      {...props}
    >
      <path
        fill="#A8A8A8"
        fillRule="evenodd"
        d="M6.24 1.869l.12-.741L4.877.89l-.119.74L4.22 5H.75v1.5h3.23L3.42 10H.75v1.5h2.43l-.42 2.632-.12.74 1.482.237.119-.74L4.7 11.5h3.48l-.42 2.632-.12.74 1.482.237.119-.74L9.7 11.5h3.55V10H9.94l.56-3.5h2.75V5h-2.51l.5-3.131.12-.741L9.877.89l-.119.74L9.22 5H5.74l.5-3.131zM8.98 6.5H5.5L4.94 10h3.48l.56-3.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      {...props}
    >
      <path
        fill="#A8A8A8"
        fillRule="evenodd"
        d="M9.53 2.22L9 1.69 7.94 2.75l.53.53 3.97 3.97H1v1.5h11.44l-3.97 3.97-.53.53L9 14.31l.53-.53 5.074-5.073a1 1 0 000-1.414L9.53 2.22z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Notebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      {...props}
    >
      <path
        fill="#666"
        fillRule="evenodd"
        d="M6.285 1.5H13V12a1 1 0 01-1 1H6.285V1.5zm-1.25 0H3V12a1 1 0 001 1h1.035V1.5zm0 13H4A2.5 2.5 0 011.5 12V0h13v12a2.5 2.5 0 01-2.5 2.5H6.285v1.125h-1.25V14.5zM8 3.75h3V5H8V3.75zm.625 2.995H8v1.25h3v-1.25H8.625z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LearnMore({
  children,
  href,
  icon,
  target,
  className,
}: {
  children: React.ReactNode;
  href: string;
  icon: 'arrow' | 'hash';
  target?: HTMLAttributeAnchorTarget;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className="text-base font-normal no-underline"
      target={target}
    >
      <div
        className={cn(
          'border-ds-gray-alpha-400 mb-4 flex rounded-md border hover:shadow-sm',
          className,
        )}
      >
        <div className="border-ds-gray-alpha-400 flex w-14 items-center justify-center border-r">
          <Notebook />
        </div>
        <div className="text-ds-gray-900 flex-auto p-4 [&>p]:m-0">
          {children}
        </div>
        <div className="text-ds-gray-600 flex w-14 items-center justify-center">
          {icon === 'arrow' ? <ArrowRight /> : <Hash />}
        </div>
      </div>
    </Link>
  );
}
