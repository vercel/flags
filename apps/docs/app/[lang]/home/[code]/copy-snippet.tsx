'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';

export const CopySnippet = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex h-10 items-center gap-2 rounded-md border bg-background-100 px-4 font-mono text-sm transition-colors hover:bg-gray-100"
    >
      <span>{text}</span>
      {copied ? (
        <Check className="size-3.5 text-gray-800" />
      ) : (
        <Copy className="size-3.5 text-gray-800" />
      )}
    </button>
  );
};
