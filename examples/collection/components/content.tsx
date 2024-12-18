import { useMemo } from 'react';
import { Header } from './header';
import { navItems } from '@/app/nav-items';

export function Content({
  children,
  crumbs,
}: {
  children: React.ReactNode;
  crumbs: string[];
}) {
  const resolvedCrumbs = useMemo(() => {
    const breadcrumbs = [];
    let current = navItems;
    for (const crumb of crumbs) {
      // @ts-expect-error crumb is a valid key.
      current = current.find((item) => item.slug === crumb);

      breadcrumbs.push({
        // @ts-expect-error crumb is a valid key.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ok
        name: current.title,
        // @ts-expect-error crumb is a valid key.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ok
        href: current.url,
      });
      // @ts-expect-error crumb is a valid key.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ok
      current = current.items;
    }
    return breadcrumbs;
  }, [crumbs]);

  return (
    <>
      <Header crumbs={resolvedCrumbs} />
      <div className="p-4 pt-0 prose lg:prose-lg mb-32">{children}</div>
    </>
  );
}
