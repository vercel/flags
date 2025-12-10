'use client';

import { CodeIcon, ExternalLinkIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { useCallback, useState } from 'react';
import Link from 'next/link';

export function IframeBrowser({
  src,
  codeSrc,
}: {
  src: string;
  codeSrc: string;
}) {
  const [key, setKey] = useState(0);

  const refresh = useCallback(() => {
    setKey((prevKey) => prevKey + 1);
  }, []);

  const resolvedSrc = src.startsWith('snippets:')
    ? `${process.env.NEXT_PUBLIC_SNIPPETS_BASE_URL}${src.slice(9)}`
    : src.startsWith('sveltekit-snippets:')
      ? `${process.env.NEXT_PUBLIC_SVELTEKIT_SNIPPETS_BASE_URL}${src.slice(19)}`
      : src;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border shadow-lg">
      <div className="flex items-center space-x-1.5 bg-gray-100 p-2">
        <div className="grow">
          <Input
            defaultValue={resolvedSrc}
            placeholder="Enter URL"
            className="w-full cursor-default bg-white"
            readOnly
            aria-labelledby="input-label"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Refresh"
              variant="secondary"
              onClick={refresh}
            >
              <RotateCcwIcon size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
          <Button
              aria-label="Show souce code"
              variant="secondary"
              asChild
            >
              <Link href={codeSrc} target="_blank" rel="noopener noreferrer">
                <CodeIcon size={14} />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Show source code</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Open in new tab"
              variant="secondary"
              asChild
            >
              <Link href={resolvedSrc} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon size={14} />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
      </div>
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        <iframe
          title="Embedded Content"
          key={key}
          src={resolvedSrc}
          className="absolute left-0 top-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}
