import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ExampleCard({
  href,
  title,
  header,
}: {
  href: string;
  title: string;
  header: string;
}) {
  return (
    <Link href={href} className="no-underline">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-gray-600 font-normal">
          {header}
        </CardContent>
      </Card>
    </Link>
  );
}
