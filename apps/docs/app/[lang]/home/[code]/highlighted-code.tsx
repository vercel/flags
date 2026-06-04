import { CodeBlock } from '@vercel/geistdocs/components/code-block';
import { geistShikiTheme } from '@vercel/geistdocs/shiki-theme';
import { highlight } from 'fumadocs-core/highlight';
import { transformerIcon } from 'fumadocs-core/mdx-plugins';
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
  // Highlight with the same theme the docs use and render through the
  // geistdocs CodeBlock so the home page blocks match the documentation.
  const rendered = await highlight(code, {
    lang,
    engine: 'js',
    theme: geistShikiTheme,
    transformers: [transformerIcon()],
    components: {
      pre: ({
        children,
        className,
        style,
        icon,
      }: ComponentProps<'pre'> & { icon?: string }) => (
        <CodeBlock
          className={className}
          icon={icon}
          style={style}
          title={filename}
        >
          {children}
        </CodeBlock>
      ),
    },
  });

  return (
    <div className="flex flex-col">
      {/* CodeBlock ships its own bottom margin; drop it so the caption sits tight. */}
      <div className="*:mb-0">{rendered}</div>
      <span className="mt-1 block text-xs text-muted-foreground">
        {caption}
      </span>
    </div>
  );
};
