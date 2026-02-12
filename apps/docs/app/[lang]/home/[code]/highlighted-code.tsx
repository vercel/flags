import { codeToHtml } from 'shiki';

type HighlightedCodeProps = {
  code: string;
  lang: string;
  filename: string;
  caption: string;
};

export const HighlightedCode = async ({
  code,
  lang,
  filename,
  caption,
}: HighlightedCodeProps) => {
  const html = await codeToHtml(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
  });

  return (
    <div className="flex flex-col">
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="border-b bg-muted/50 px-4 py-2 font-mono text-xs text-muted-foreground">
          {filename}
        </div>
        <div
          className="flex-1 overflow-x-auto text-sm [&>pre]:h-full [&>pre]:p-4 [&>pre]:!bg-transparent [&_code]:block [&_code_.line]:min-h-[1lh]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <span className="mt-1 block text-xs text-muted-foreground">{caption}</span>
    </div>
  );
};
