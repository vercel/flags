'use client';
import { track } from '@vercel/analytics';
import { useToasts } from '@vercel/geistdocs/components/toasts';
import { Toggle } from '@vercel/geistdocs/components/toggle';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const oneYearInSeconds = 31_536_000;

function message(flagKey: string) {
  return `Changed ${flagKey}. Reload as often as you like to see the flag applied statically without layout shift.`;
}

/**
 * Warn on slow connections as users are otherwise left without feedback when
 * they trigger flags.
 *
 * Use the clearTimeout to ensure we clean up properly as the flag is toggled
 * multiple times.
 */
function useInitSlowConnectionWarning() {
  const { warning } = useToasts();
  const pair = useState(false);
  const [shown, setShown] = pair;

  useEffect(() => {
    if (!shown) return;

    const timeout = setTimeout(() => {
      if (sessionStorage.getItem('toast')) {
        warning({
          text: 'You appear to be on a slow connection. This flag will apply after the page finishes reloading.',
        });
      }
    }, 1150);

    return () => {
      clearTimeout(timeout);
    };
  }, [shown, warning]);

  const show = useCallback(() => {
    setShown(true);
  }, []);

  return show;
}

interface FlagToggleProps {
  value: boolean;
  flagKey: string;
  label: string;
  description?: string;
  scroll?: boolean;
}

export const FlagToggle = ({
  value,
  flagKey,
  label,
  description,
  scroll,
}: FlagToggleProps) => {
  const router = useRouter();

  // use an override to toggle the value optimistically, without
  // waiting for the reload to apply
  const [override, setOverride] = useState<boolean | null>(null);
  const initSlowConnectionWarning = useInitSlowConnectionWarning();

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex flex-col gap-y-0.5">
        <Label className="font-mono text-sm">{label}</Label>
        {description ? (
          <span className="text-gray-900 text-sm">{description}</span>
        ) : null}
      </div>
      <Toggle
        checked={override === null ? value : override}
        size="medium"
        onChange={(nextValue: boolean) => {
          document.cookie = `${flagKey}=${nextValue ? '1' : '0'}; max-age=${oneYearInSeconds}; path=/`;
          sessionStorage.setItem('toast', message(flagKey));
          setOverride(nextValue);
          initSlowConnectionWarning();
          track('playground_toggle', { flagKey });
          if (scroll && nextValue) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          router.refresh();
        }}
      >
        <span className="sr-only">{label}</span>
      </Toggle>
    </div>
  );
};

interface FlagSelectProps {
  value: string;
  flagKey: string;
  label: string;
  description?: string;
  options: { value: string }[] | undefined;
}

export const FlagSelect = ({
  value,
  flagKey,
  label,
  description,
  options,
}: FlagSelectProps) => {
  const router = useRouter();

  // use an override to toggle the value optimistically, without
  // waiting for the reload to apply
  const [override, setOverride] = useState<string | null>(null);
  const initSlowConnectionWarning = useInitSlowConnectionWarning();

  return (
    <div className="flex w-full items-start px-2 py-4">
      <div className="flex w-full flex-col gap-y-0.5">
        <Label htmlFor={flagKey} className="font-mono text-sm">
          {label}
        </Label>
        {description ? (
          <span className="text-gray-900 text-sm">{description}</span>
        ) : null}

        <Select
          value={override === null ? value : override}
          onValueChange={(nextValue: string) => {
            document.cookie = `${flagKey}=${encodeURIComponent(nextValue)}; max-age=${oneYearInSeconds}; path=/`;
            sessionStorage.setItem('toast', message(flagKey));
            setOverride(nextValue);
            track('playground_toggle', { flagKey });
            initSlowConnectionWarning();
            router.refresh();
          }}
        >
          <SelectTrigger id={flagKey} className="mt-1.5 w-full">
            <SelectValue placeholder="Select an option">
              {override === null ? value : override}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
