interface CartItem {
  color: string;
  size: string;
  quantity: number;
}

interface Cart {
  items: CartItem[];
}

export function getCart(): Cart {
  try {
    const cartCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('cart='));

    if (cartCookie) {
      const cartData = JSON.parse(decodeURIComponent(cartCookie.split('=')[1]));
      return cartData;
    }
  } catch (error) {
    console.error('Error reading cart cookie:', error);
  }

  return { items: [] };
}

export function addToCart(item: Omit<CartItem, 'quantity'>): void {
  const cart = getCart();
  const existingItemIndex = cart.items.findIndex(
    (i) => i.color === item.color && i.size === item.size,
  );

  if (existingItemIndex >= 0) {
    cart.items[existingItemIndex].quantity += 1;
  } else {
    cart.items.push({ ...item, quantity: 1 });
  }

  document.cookie = `cart=${encodeURIComponent(JSON.stringify(cart))}; path=/`;
}

export function getCartItemCount(): number {
  const cart = getCart();
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

export function getServerCart(cookieStr?: string): Cart {
  try {
    if (cookieStr) {
      const cartCookie = cookieStr
        .split('; ')
        .find((row) => row.startsWith('cart='));

      if (cartCookie) {
        const cartData = JSON.parse(
          decodeURIComponent(cartCookie.split('=')[1]),
        );
        return cartData;
      }
    }
  } catch (error) {
    console.error('Error reading cart cookie:', error);
  }

  return { items: [] };
}
