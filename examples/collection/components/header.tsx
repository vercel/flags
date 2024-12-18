import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Fragment } from 'react';

export interface HeaderProps {
  crumbs: { name: string; href?: string }[];
}

export function Header({ crumbs }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            const content = isLast ? (
              <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
            ) : (
              crumb.name
            );
            return (
              <Fragment key={crumb.name}>
                {crumb.href ? (
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href={crumb.href}>{content}</BreadcrumbLink>
                  </BreadcrumbItem>
                ) : (
                  <BreadcrumbItem>{content}</BreadcrumbItem>
                )}
                {isLast ? null : (
                  <BreadcrumbSeparator className="hidden md:block" />
                )}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
