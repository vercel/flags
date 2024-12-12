import { Content } from '@/components/content';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';

export default function Page() {
  // This page should talk about the need to declare options upfront.
  return (
    <Content crumbs={['concepts']}>
      <h2>Concepts</h2>
      <div className="grid grid-cols-1 gap-4">
        <Link href="/concepts/identify" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Identify</CardTitle>
              <CardDescription>Establishing evaluation context</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/concepts/dedupe" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Dedupe</CardTitle>
              <CardDescription>Preventing duplicate work</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/concepts/precompute" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Precompute</CardTitle>
              <CardDescription>
                Using feature flags on static pages
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/concepts/adapters" className="no-underline">
          <Card>
            <CardHeader>
              <CardTitle>Adapters</CardTitle>
              <CardDescription>
                Using adapters to integrate providers
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </Content>
  );
}
