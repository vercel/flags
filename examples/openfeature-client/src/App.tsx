import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import {
  OpenFeature,
  OpenFeatureProvider,
  useFlag,
} from '@openfeature/react-sdk';
import { Suspense } from 'react';
import './index.css';

const ofrepProvider = new OFREPWebProvider({
  baseUrl: '',
  pollInterval: 10_000,
  // pollInterval: 60_000,
});

type AppEvaluationContext = { visitor?: { id: string } };
const visitor1Context: AppEvaluationContext = { visitor: { id: 'visitor1' } };
const visitor2Context: AppEvaluationContext = { visitor: { id: 'visitor2' } };

// Use FakeSlowProvider with a 2 second delay to test suspense behavior
// You can adjust the delay by passing a second argument: new FakeSlowProvider(flagConfig, 3000)
OpenFeature.setProvider(ofrepProvider, visitor1Context);

function Subtitle() {
  const { value: showNewMessage } = useFlag('summer-sale', false, {
    suspend: true,
  });

  // for display purposes only
  const evaluationContext = OpenFeature.getContext() as AppEvaluationContext;

  return (
    <p>
      Test flag is <i>{showNewMessage ? 'on' : 'off'}</i> for{' '}
      <i>{evaluationContext.visitor?.id}</i>
    </p>
  );
}

export function App() {
  return (
    <OpenFeatureProvider>
      <div className="app">
        <h2>Vercel Flags & OpenFeature React SDK example</h2>
        <Suspense fallback={<p>Loading...</p>}>
          <Subtitle />
        </Suspense>
        <button
          type="button"
          onClick={() => {
            OpenFeature.setContext(visitor1Context);
          }}
        >
          visitor1
        </button>{' '}
        <button
          type="button"
          onClick={() => {
            OpenFeature.setContext(visitor2Context);
          }}
        >
          visitor2
        </button>
      </div>
    </OpenFeatureProvider>
  );
}

export default App;
