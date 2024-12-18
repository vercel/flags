'use client';

import React, { useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto border rounded-lg overflow-hidden shadow-lg">
      <div className="flex items-center space-x-2 p-2 bg-gray-100">
        <div className="flex-grow">
          <Input
            type="url"
            defaultValue={src}
            placeholder="Enter URL"
            className="w-full bg-white cursor-default"
            readOnly
          />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" asChild>
                <Link href={codeSrc} target="_blank" rel="noopener noreferrer">
                  <Code className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Show source code</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" asChild>
                <Link href={src} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open in new tab</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        <iframe
          key={key}
          src={src}
          className="absolute top-0 left-0 w-full h-full border-0"
        />
      </div>
    </div>
  );
}
