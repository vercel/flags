import type { CSSProperties } from 'react';
import { codeToTokens } from 'shiki';

type HighlightedCodeProps = {
  code: string;
  lang: string;
  filename: string;
  caption: string;
};

const parseCssString = (css: string): Record<string, string> => {
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx > 0) {
      const prop = decl.slice(0, idx).trim();
      const val = decl.slice(idx + 1).trim();
      if (prop && val) {
        style[prop] = val;
      }
    }
  }
  return style;
};

export const HighlightedCode = async ({
  code,
  lang,
  filename,
  caption,
}: HighlightedCodeProps) => {
  const result = await codeToTokens(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
  });

  const preStyle: Record<string, string> = {};

  if (result.bg) {
    preStyle['--sdm-bg'] = result.bg;
  }
  if (result.fg) {
    preStyle['--sdm-fg'] = result.fg;
  }
  if (result.rootStyle) {
    Object.assign(preStyle, parseCssString(result.rootStyle));
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="border-b bg-muted/50 px-4 py-2 font-mono text-xs text-muted-foreground">
          {filename}
        </div>
        <pre
          className="flex-1 overflow-x-auto p-4 text-sm bg-[var(--sdm-bg,transparent)] dark:!bg-[var(--shiki-dark-bg,var(--sdm-bg,transparent))]"
          style={preStyle as CSSProperties}
        >
          <code className="block">
            {result.tokens.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable token order
              <span className="block min-h-[1lh]" key={index}>
                {row.map((token, tokenIndex) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable token order
                    key={tokenIndex}
                    className={[
                      'text-[var(--sdm-c,inherit)]',
                      'dark:!text-[var(--shiki-dark,var(--sdm-c,inherit))]',
                      token.bgColor ? 'bg-[var(--sdm-tbg)]' : '',
                      token.bgColor
                        ? 'dark:!bg-[var(--shiki-dark-bg,var(--sdm-tbg))]'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      {
                        ...(token.color ? { '--sdm-c': token.color } : {}),
                        ...(token.bgColor
                          ? { '--sdm-tbg': token.bgColor }
                          : {}),
                        ...(token.htmlStyle
                          ? typeof token.htmlStyle === 'string'
                            ? parseCssString(token.htmlStyle)
                            : token.htmlStyle
                          : {}),
                      } as CSSProperties
                    }
                    {...token.htmlAttrs}
                  >
                    {token.content}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <span className="mt-1 block text-xs text-muted-foreground">
        {caption}
      </span>
    </div>
  );
};
