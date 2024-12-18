import { Code } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SelfDocumentingExampleAlert({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Alert>
      <Code className="h-4 w-4" />
      <AlertTitle>Self document example</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
