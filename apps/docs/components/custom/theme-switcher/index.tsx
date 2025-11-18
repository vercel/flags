'use client';

import { useTheme } from '@vercel/geist/core';
import { DeviceDesktop, Moon, Sun } from '@vercel/geist/icons';
import { clsx } from 'clsx';
import { useTheme as useNextTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import styles from './theme-switcher.module.css';

export function ThemeSwitcher({
  className,
  size = 28,
  short = false,
}: {
  className?: string;
  size?: number;
  short?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const { setTheme: setNextTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const iconSize = size / 2;
  const padding = size / 10.67;

  useEffect(() => {
    setMounted(true);
  }, []);

  // avoid hydration errors
  if (!mounted) return null;

  return (
    <div
      className={clsx(styles.root, className)}
      style={{ padding: short ? '0' : `${padding}px` }}
      role="radiogroup"
    >
      {/** biome-ignore lint/a11y/useSemanticElements: shadcn */}
      <button
        aria-checked={theme === 'light'}
        aria-label="Switch to light theme"
        className={styles.switch}
        data-active={theme === 'light'}
        style={{
          height: `${size}px`,
          width: `${size}px`,
        }}
        data-theme-switcher
        onClick={(): void => {
          setTheme('light');
          setNextTheme('light');
        }}
        role="radio"
        type="button"
      >
        <Sun size={iconSize} />
      </button>
      {/** biome-ignore lint/a11y/useSemanticElements: shadcn */}
      <button
        aria-checked={theme === 'system'}
        aria-label="Switch to system theme"
        className={styles.switch}
        style={{
          height: `${size}px`,
          width: `${size}px`,
        }}
        data-active={theme === 'system'}
        data-theme-switcher
        onClick={(): void => {
          setTheme('system');
          setNextTheme('system');
        }}
        role="radio"
        type="button"
      >
        <DeviceDesktop size={iconSize} />
      </button>
      {/** biome-ignore lint/a11y/useSemanticElements: shadcn */}
      <button
        aria-checked={theme === 'dark'}
        aria-label="Switch to dark theme"
        className={styles.switch}
        style={{
          height: `${size}px`,
          width: `${size}px`,
        }}
        data-active={theme === 'dark'}
        data-theme-switcher
        onClick={(): void => {
          setTheme('dark');
          setNextTheme('dark');
        }}
        role="radio"
        type="button"
      >
        <Moon size={iconSize} />
      </button>
    </div>
  );
}
