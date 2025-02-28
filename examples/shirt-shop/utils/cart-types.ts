export interface CartItem {
  color: string;
  size: string;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
}
