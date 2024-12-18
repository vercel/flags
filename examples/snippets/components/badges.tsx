import { Badge } from './ui/badge';

export function Badges({
  appRouter,
  pagesRouter,
}: {
  appRouter?: boolean;
  pagesRouter?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {appRouter ? <Badge variant="secondary">App Router</Badge> : null}
      {pagesRouter ? <Badge variant="secondary">Pages Router</Badge> : null}
    </div>
  );
}
