// Demo copy only. Replace this with descriptions from the provider API later.
const descriptions: Record<string, string> = {
  flag0:
    'Enable the redesigned storefront.\n\nReturns `true` for visitors who should see the new shopping experience.',
  'enable-example-feature':
    'Enable the example feature for selected visitors.\n\nUse this flag to release the feature gradually without a new deployment.',
  'fake-hat-checkout-experiment':
    'Choose the shipping message shown during checkout.\n\nCompares standard shipping with a free-shipping message. Read `params.displayFreeShippingLabel` to select the message. Assignment is stable for the same visitor ID.',
  'flag-with-rollout':
    'Release the new checkout to visitors in the rollout.\n\nThe provider controls the rollout schedule and targeting rules.',
  'test-string':
    'Select the offer shown in the storefront.\n\nReturns `normal`, `discount-50`, or `discount-20`, based on the provider targeting rules.',
  'json-flag':
    'Load the storefront presentation settings.\n\nThe value can be a settings object, a headline string, or `null`. Check the value type before reading its properties.',
  enableDemoDaysFlag: 'This is a test description, hi demo days!!',
};

export function getDemoDescription(key: string): string {
  return (
    descriptions[key] ??
    `Evaluate the ${JSON.stringify(key)} feature flag for the current visitor.`
  );
}
