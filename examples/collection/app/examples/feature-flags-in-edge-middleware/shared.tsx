import { DemoFlag } from '@/components/demo-flag';
import { basicEdgeMiddlewareFlag } from './flags';
import { Button } from '@/components/ui/button';
import { actAsFlaggedInUser, actAsFlaggedOutUser, clear } from './handlers';

// This component  does not actually use the feature flag, but the
// variant-on and variant-off pages know about the value statically.
export function Shared({ variant }: { variant: 'on' | 'off' }) {
  return (
    <>
      <DemoFlag name={basicEdgeMiddlewareFlag.key} value={variant === 'on'} />
      <div className="flex gap-2">
        <Button onClick={actAsFlaggedInUser} variant="outline">
          Act as a flagged in user
        </Button>
        <Button onClick={actAsFlaggedOutUser} variant="outline">
          Act as a flagged out user
        </Button>
        <Button onClick={clear} variant="outline">
          Clear cookie
        </Button>
      </div>
    </>
  );
}
