'use client';

import { track } from '@vercel/analytics';
import { useEffect } from 'react';
import { getFlagsAsCodeTitle } from '@/app/actions/flags-as-code-title';

// Keep in sync with VISITOR_ID_COOKIE in experiment-flags.ts.
const VISITOR_ID_COOKIE = 'flags-visitor-id';
const oneYearInSeconds = 31_536_000;

const getVisitorId = (): string => {
  const existing = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${VISITOR_ID_COOKIE}=`))
    ?.split('=')[1];
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  document.cookie = `${VISITOR_ID_COOKIE}=${id}; max-age=${oneYearInSeconds}; path=/; samesite=lax`;
  return id;
};

const isCopyPageButton = (button: HTMLButtonElement): boolean => {
  if (button.getAttribute('aria-label') === 'Copy page') {
    return true;
  }
  const text = button.textContent?.trim() ?? '';
  return text.startsWith('Copy page') || text.startsWith('Copy for LLM');
};

/**
 * Swaps the page H1 for the treatment variant and tracks presses on the
 * "Copy page" button for the `flags-as-code-title-experiment` experiment.
 */
export const FlagsAsCodeTitleExperiment = () => {
  useEffect(() => {
    const visitorId = getVisitorId();
    let cancelled = false;

    getFlagsAsCodeTitle()
      .then((title) => {
        if (cancelled) {
          return;
        }
        const heading = document.querySelector(
          '[data-geistdocs-article="title"]',
        );
        if (heading && heading.textContent !== title) {
          heading.textContent = title;
        }
      })
      .catch(() => {
        // Keep the default title when the flag can not be evaluated.
      });

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('button');
      if (button && isCopyPageButton(button)) {
        track('copy_page_clicked', { visitorId });
      }
    };
    document.addEventListener('click', onClick, { capture: true });

    return () => {
      cancelled = true;
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  return null;
};
