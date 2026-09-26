'use client';

import { Button } from '@vercel/geistdocs/components/button';
import { Input } from '@vercel/geistdocs/components/input';
import { Tooltip } from '@vercel/geistdocs/components/tooltip';
import { CodeXml, ExternalLink, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';

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
      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-background-100 p-2">
        <div className="flex-grow">
          <Input
            aria-label="Preview URL"
            className="w-full cursor-default bg-white dark:bg-background-100"
            defaultValue={resolvedSrc}
            placeholder="Enter URL"
            readOnly
            width="100%"
          />
        </div>
        <Tooltip delay={false} text="Refresh">
          <Button
            aria-label="Refresh"
            onClick={refresh}
            size="small"
            svgOnly
            variant="secondary"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip delay={false} text="Show source code">
          <Button
            aria-label="Show source code"
            Component="a"
            href={codeSrc}
            rel="noopener noreferrer"
            size="small"
            svgOnly
            target="_blank"
            variant="secondary"
          >
            <CodeXml className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip delay={false} text="Open in new tab">
          <Button
            aria-label="Open in new tab"
            Component="a"
            href={resolvedSrc}
            rel="noopener noreferrer"
            size="small"
            svgOnly
            target="_blank"
            variant="secondary"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </Tooltip>
      </div>
      <div
        className="relative w-full bg-white dark:bg-black"
        style={{ paddingTop: '56.25%' }}
      >
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
