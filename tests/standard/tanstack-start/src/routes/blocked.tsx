import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/blocked')({
  component: () => <p>Blocked</p>,
});
