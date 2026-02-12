'use client';

import { Button, ButtonLink, Input, Tooltip } from '@vercel/geist/components';
import { Code, External, RefreshClockwise } from '@vercel/geist/icons';
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
      <div className="flex items-center space-x-1.5 bg-gray-100 p-2">
        <div className="flex-grow">
          <Input
            defaultValue={resolvedSrc}
            placeholder="Enter URL"
            className="w-full cursor-default bg-white"
            readOnly
            aria-labelledby="input-label"
          />
        </div>
        <Tooltip desktopOnly text="Refresh">
          <Button
            shape="square"
            aria-label="Refresh"
            type="secondary"
            onClick={refresh}
          >
            <RefreshClockwise size={14} />
          </Button>
        </Tooltip>
        <Tooltip desktopOnly text="Show source code">
          <ButtonLink
            shape="square"
            aria-label="Show souce code"
            type="secondary"
            href={codeSrc}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Code size={14} />
          </ButtonLink>
        </Tooltip>

        <Tooltip desktopOnly text="Open in new tab">
          <ButtonLink
            shape="square"
            aria-label="Open in new tab"
            type="secondary"
            href={resolvedSrc}
            target="_blank"
            rel="noopener noreferrer"
          >
            <External size={14} />
          </ButtonLink>
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
