export type CheckoutExperiment = {
  experimentId: string;
  variantId: string;
  isControl: boolean;
  params: {
    displayFreeShippingLabel: boolean;
  };
};

export type Entity = {
  visitor: {
    id: string;
  };
};
