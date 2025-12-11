import { SiTypescript } from "@icons-pack/react-simple-icons";
import { codeToHtml } from "shiki";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";

const preClassNames = cn("[&_.shiki]:bg-transparent!");

const darkModeClassNames = cn(
  "dark:[&_.shiki]:text-[var(--shiki-dark)]!",
  "dark:[&_.shiki]:[font-style:var(--shiki-dark-font-style)]!",
  "dark:[&_.shiki]:[font-weight:var(--shiki-dark-font-weight)]!",
  "dark:[&_.shiki]:[text-decoration:var(--shiki-dark-text-decoration)]!",
  "dark:[&_.shiki_span]:text-[var(--shiki-dark)]!",
  "dark:[&_.shiki_span]:[font-style:var(--shiki-dark-font-style)]!",
  "dark:[&_.shiki_span]:[font-weight:var(--shiki-dark-font-weight)]!",
  "dark:[&_.shiki_span]:[text-decoration:var(--shiki-dark-text-decoration)]!"
);

const defineCode = `import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    return Math.random() > 0.5;
  },
});`;

const consumeCode = `import { exampleFlag } from "../flags";

export default async function Page() {
  const example = await exampleFlag();

  return <div>Flag {example ? "on" : "off"}</div>;
}`;

const CodeBlock = ({
  filename,
  children,
  source,
}: {
  filename: string;
  children: string;
  source: string;
}) => (
  <div className="size-full divide-y overflow-hidden rounded-md border bg-background">
    <div className="flex items-center bg-sidebar p-4 text-muted-foreground text-sm">
      <SiTypescript className="mr-2 size-4 shrink-0" />
      <span className="flex-1">{filename}</span>
      <CopyButton code={source} />
    </div>
    <div
      className={cn(
        "size-full overflow-auto py-4 text-sm",
        preClassNames,
        darkModeClassNames
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
      dangerouslySetInnerHTML={{ __html: children }}
    />
  </div>
);

export const Demo = async () => {
  const defineCodeHtml = await codeToHtml(defineCode, {
    lang: "javascript",
    themes: { light: "github-light", dark: "github-dark" },
  });

  const consumeCodeHtml = await codeToHtml(consumeCode, {
    lang: "javascript",
    themes: { light: "github-light", dark: "github-dark" },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex h-full flex-col gap-2">
        <CodeBlock
          filename="flags.ts"
          source={defineCode}
        >
          {defineCodeHtml}
        </CodeBlock>
        <p className="text-muted-foreground text-sm">
          Declaring a flag
        </p>
      </div>
      <div className="flex h-full flex-col gap-2">
        <CodeBlock
          filename="app/page.tsx"
          source={consumeCode}
        >
          {consumeCodeHtml}
        </CodeBlock>
        <p className="text-muted-foreground text-sm">
          Using a flag
        </p>
      </div>
    </div>
  )
};