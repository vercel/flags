import { File } from 'lucide-react';
import {
  type BundledTheme,
  type CodeToHastOptions,
  codeToHtml,
  type StringLiteralUnion,
  type ThemeRegistrationAny,
} from 'shiki';
import stripIndent from 'strip-indent';

export async function CodeBlock({
  children,
  plain,
  lang = 'tsx',
  theme = 'nord',
  fileName,
}: {
  children: string;
  plain?: boolean;
  lang?: CodeToHastOptions['lang'];
  theme?: ThemeRegistrationAny | StringLiteralUnion<BundledTheme>;
  fileName?: string;
}) {
  const __html = await codeToHtml(
    plain
      ? children
      : stripIndent(
          children.startsWith('\n') ? children.substring(1) : children,
        ),
    {
      lang,
      theme,
    },
  );

  return (
    <div>
      <div className="mb-0 pb-0" dangerouslySetInnerHTML={{ __html }} />
      {fileName ? (
        <div className="-mt-6 lg:-mt-8 pt-1 pl-2 text-sm text-gray-500 flex gap-1 flex-row items-center justify-center">
          {' '}
          <File className="w-4" /> {fileName}
        </div>
      ) : null}
    </div>
  );
}
