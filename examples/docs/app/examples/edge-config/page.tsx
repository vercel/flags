import { Content } from '@/components/content';

export default function EdgeConfigPage() {
  return (
    <Content crumbs={['examples', 'edge-config']}>
      <h2>Edge Config</h2>
      <p>
        Shows feature flags backed by Edge Config, without any third-party
        provider.
      </p>
    </Content>
  );
}
