import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Navigation } from '@/components/nav';

/**
 * Shared layout configurations
 *
 * you can configure layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */

export const baseOptions: BaseLayoutProps = {
  nav: {
    component: <Navigation />,
    title: 'Flags SDK',
  },
  links: [],
};
