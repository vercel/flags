import {
  OpenFeature,
  OpenFeatureProvider,
  useFlag,
} from '@openfeature/react-sdk';
import './index.css';
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

import { Suspense } from 'react';

const ofrepProvider = new OFREPWebProvider({
  baseUrl: '',
  pollInterval: 10_000,
  // pollInterval: 60_000,
});

const originalContext = {
  targetingKey: 'user1',
  user: {
    id: 'user1',
  },
};

const alternativeContext = {
  targetingKey: 'user2',
  user: {
    id: 'user2',
  },
};

// Use FakeSlowProvider with a 2 second delay to test suspense behavior
// You can adjust the delay by passing a second argument: new FakeSlowProvider(flagConfig, 3000)
OpenFeature.setProvider(ofrepProvider, originalContext);

function Subtitle() {
  const { value: showNewMessage } = useFlag('summer-sale', false, {
    suspend: true,
  });

  return <p>{showNewMessage ? 'Test flag is on' : 'Test flag is off'}</p>;
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
            OpenFeature.setContext(originalContext);
          }}
        >
          context a
        </button>{' '}
        <button
          type="button"
          onClick={() => {
            OpenFeature.setContext(alternativeContext);
          }}
        >
          context b
        </button>
      </div>
    </OpenFeatureProvider>
  );
}

export default App;
