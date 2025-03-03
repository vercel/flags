import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

interface CartItem {
  id: string;
  color: string;
  size: string;
  quantity: number;
}

interface Cart {
  id: string;
  items: CartItem[];
}

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Helper function to get cart key
const getCartKey = (cartId: string) => `cart:${cartId}`;

// 22 hours in seconds
const CART_TTL = 22 * 60 * 60;

// GET /api/[cartId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cartId: string }> },
) {
  const { cartId } = await params;
  try {
    const cartKey = getCartKey(cartId);
    const cart = await redis.get<Cart>(cartKey);

    if (!cart) {
      const newCart: Cart = {
        id: cartId,
        items: [],
      };
      return NextResponse.json(newCart);
    }

    return NextResponse.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cart' },
      { status: 500 },
    );
  }
}

// POST /api/[cartId]
export async function POST(
  request: Request,
  { params }: { params: Promise<{ cartId: string }> },
) {
  const { cartId } = await params;
  try {
    const cartKey = getCartKey(cartId);
    const item: CartItem = await request.json();

    // Get existing cart or create new one
    const existingCart = (await redis.get<Cart>(cartKey)) || {
      id: cartId,
      items: [],
    };

    // Find if item already exists
    const existingItemIndex = existingCart.items.findIndex(
      (i: CartItem) =>
        i.id === item.id && i.color === item.color && i.size === item.size,
    );

    if (existingItemIndex >= 0) {
      // Update quantity if item exists
      existingCart.items[existingItemIndex].quantity += item.quantity;
    } else {
      // Add new item
      existingCart.items.push(item);
    }

    // Save cart with expiration
    await redis.set(cartKey, existingCart, { ex: CART_TTL });

    return NextResponse.json(existingCart);
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return NextResponse.json(
      { error: 'Failed to add item to cart' },
      { status: 500 },
    );
  }
}

// DELETE /api/[cartId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ cartId: string }> },
) {
  const { cartId } = await params;
  try {
    const cartKey = getCartKey(cartId);
    const item = await request.json();

    // Get existing cart
    const existingCart = await redis.get<Cart>(cartKey);

    if (!existingCart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }

    // Find the index of the matching item
    const itemIndex = existingCart.items.findIndex(
      (i) => i.id === item.id && i.color === item.color && i.size === item.size,
    );

    if (itemIndex === -1) {
      return NextResponse.json(
        { error: 'Item not found in cart' },
        { status: 404 },
      );
    }

    if (existingCart.items[itemIndex].quantity === 1) {
      existingCart.items.splice(itemIndex, 1);
    } else {
      existingCart.items[itemIndex].quantity -= 1;
    }

    // Save updated cart with expiration
    await redis.set(cartKey, existingCart, { ex: CART_TTL });

    return NextResponse.json(existingCart);
  } catch (error) {
    console.error('Error removing item from cart:', error);
    return NextResponse.json(
      { error: 'Failed to remove item from cart' },
      { status: 500 },
    );
  }
}
