import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { shopFlags } from './definitions';

// The OpenFeature provider of the source. Any OpenFeature provider works.
export default new TypedInMemoryProvider(shopFlags);
