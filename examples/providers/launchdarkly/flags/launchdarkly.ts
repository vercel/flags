import { LaunchDarklyProvider } from '@launchdarkly/openfeature-node-server';
import { defineSource } from 'flags';

const projectId = process.env.LAUNCHDARKLY_PROJECT_SLUG;

export const launchdarkly = defineSource({
  // The provider opens its connection to LaunchDarkly when it is created
  provider: new LaunchDarklyProvider(process.env.LAUNCHDARKLY_SDK_KEY ?? ''),
  // The LaunchDarkly project, for the links of Flags Explorer to the
  // dashboard. The links use the project key and the environment key.
  project: projectId
    ? {
        system: 'launchdarkly',
        projectId,
        environment: process.env.LAUNCHDARKLY_ENVIRONMENT,
      }
    : undefined,
  // A shared demo context keeps this example focused on flag evaluation.
  // It runs once per request for all flags of this source. The provider
  // reads `kind` as the LaunchDarkly context kind, and `targetingKey` as
  // its key.
  getEvaluationContext: () => ({ kind: 'user', targetingKey: 'demo-user' }),
});
