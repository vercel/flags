import { CodeBlock } from '@vercel/geistdocs/components/code-block';
import { geistShikiTheme } from '@vercel/geistdocs/shiki-theme';
import { highlight } from 'fumadocs-core/highlight';
import { cacheLife } from 'next/cache';
import type { ComponentProps } from 'react';
import type { BundledLanguage } from 'shiki';

type HighlightedCodeProps = {
  code: string;
  lang: BundledLanguage;
  filename: string;
  caption: string;
};

export const HighlightedCode = async ({
  code,
  lang,
  filename,
  caption,
}: HighlightedCodeProps) => {
  // Shiki reads Date.now() internally, so Cache Components requires the
  // highlight to be cached rather than re-run during prerendering.
  'use cache';
  cacheLife('max');

  // Highlight with the same theme the docs use and render through the
  // geistdocs CodeBlock so the home page blocks match the documentation.
  const rendered = await highlight(code, {
    lang,
    engine: 'js',
    theme: geistShikiTheme,
    components: {
      pre: ({ children, className }: ComponentProps<'pre'>) => (
        <CodeBlock className={className} title={filename}>
          {children}
        </CodeBlock>
      ),
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 [&_[data-geist-code-block]]:my-0! [&_[data-geist-code-block]]:flex [&_[data-geist-code-block]]:h-full [&_[data-geist-code-block]]:flex-col [&_[data-section=content]]:flex-1 [&_[data-section=content]>pre]:h-full [&_[data-section=tabs]>div:first-child>span:first-child]:hidden">
        {rendered}
      </div>
      <span className="mt-2 block text-copy-14 text-gray-900">{caption}</span>
    </div>
  );
};
