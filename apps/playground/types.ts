export type CheckoutExperiment = {
  unitType: string;
  experimentId: string;
  variantId: string;
  isControl: boolean;
  params: {
    displayFreeShippingLabel: boolean;
  };
};

export type ShopProduct = {
  id: string;
  name: string;
  price: number;
  color: string;
};

export type Entity = {
  visitor: {
    id: string;
  };
};
