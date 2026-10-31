export type MockVariable = {
  getKey: () => string;
  getValue: () => unknown;
};

export type MockVariation = {
  getVariables: () => MockVariable[];
};

export type MockCampaign = {
  getVariations: () => MockVariation[];
};

export type MockFeature = {
  getKey: () => string;
  getName: () => string;
  getRulesLinkedCampaign: () => MockCampaign[];
};

export function createMockVariable(key: string, value: unknown): MockVariable {
  return {
    getKey: () => key,
    getValue: () => value,
  };
}

export function createPlainVariable(
  key: string,
  value: unknown,
): { key: string; value: unknown } {
  return { key, value };
}

export function createMockVariation(variables: MockVariable[]): MockVariation {
  return {
    getVariables: () => variables,
  };
}

export function createMockCampaign(variations: MockVariation[]): MockCampaign {
  return {
    getVariations: () => variations,
  };
}

export function createMockFeature(options: {
  key: string;
  name?: string;
  campaigns?: MockCampaign[];
}): MockFeature {
  return {
    getKey: () => options.key,
    getName: () => options.name ?? options.key,
    getRulesLinkedCampaign: () => options.campaigns ?? [],
  };
}

export function createMockWingifyClient(features: MockFeature[]) {
  return {
    settings: {
      getFeatures: () => features,
    },
  };
}
