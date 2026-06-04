'use client';

import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptList,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptTrigger,
  CommandPromptTriggerDivider,
  CommandPromptViewport,
} from '@vercel/geistdocs/components/command-prompt';
import { useState } from 'react';

const COMMAND_FOR_HUMANS = 'npm install flags';
const COMMAND_FOR_AGENTS = 'npx skills add vercel/flags@flags-sdk';
const oneYearInSeconds = 31_536_000;

type Audience = 'humans' | 'agents';

interface InstallCommandProps {
  value: Audience;
  flagKey: string;
}

export const InstallCommand = ({ value, flagKey }: InstallCommandProps) => {
  // The optimistic override drives the UI instantly and the cookie persists the
  // choice for the next load (the server reads it and renders the matching
  // prebuilt `[code]`). We intentionally do NOT call router.refresh() here:
  // this flag's only consumer is this switcher, so a refresh changes nothing
  // visible, but it remounts the subtree mid-toggle and kills the command-line
  // width animation.
  const [override, setOverride] = useState<Audience | null>(null);
  const current = override ?? value;

  return (
    <CommandPromptRoot
      className="mt-6 items-start"
      onValueChange={(next) => {
        const nextValue = next as Audience;
        if (nextValue === current) return;
        document.cookie = `${flagKey}=${nextValue}; max-age=${oneYearInSeconds}; path=/`;
        setOverride(nextValue);
      }}
      value={current}
    >
      <CommandPromptList>
        <CommandPromptTrigger className="min-w-[90px]" value="humans">
          For humans
        </CommandPromptTrigger>
        <CommandPromptTriggerDivider />
        <CommandPromptTrigger className="min-w-[84px]" value="agents">
          For agents
        </CommandPromptTrigger>
      </CommandPromptList>
      <CommandPromptSurface>
        <CommandPromptPrefix>$</CommandPromptPrefix>
        <CommandPromptViewport>
          <CommandPromptContent copyValue={COMMAND_FOR_HUMANS} value="humans">
            {COMMAND_FOR_HUMANS}
          </CommandPromptContent>
          <CommandPromptContent copyValue={COMMAND_FOR_AGENTS} value="agents">
            {COMMAND_FOR_AGENTS}
          </CommandPromptContent>
        </CommandPromptViewport>
        <CommandPromptCopy />
      </CommandPromptSurface>
    </CommandPromptRoot>
  );
};
