'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
} from '@/components/ui/command-prompt';

const COMMAND_FOR_HUMANS = 'npm install flags';
const COMMAND_FOR_AGENTS = 'npx skills add vercel/flags@flags-sdk';
const oneYearInSeconds = 31_536_000;

type Audience = 'humans' | 'agents';

interface InstallCommandProps {
  value: Audience;
  flagKey: string;
}

export const InstallCommand = ({ value, flagKey }: InstallCommandProps) => {
  const router = useRouter();
  // Optimistic override so the tab updates instantly; the server render of the
  // matching prebuilt `[code]` takes over on refresh.
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
        router.refresh();
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
