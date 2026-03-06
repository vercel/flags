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
  url: process.env.KV_REST_API_URL as string,
  token: process.env.KV_REST_API_TOKEN as string,
});

/** Maximum allowed cart items to prevent resource exhaustion */
const MAX_CART_ITEMS = 100;
/** Maximum request body size (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Validates that a cartId is safe for use as a Redis key component.
 * Prevents Redis key injection via crafted cartId values containing
 * special characters like newlines, spaces, or glob patterns.
 */
function isValidCartId(cartId: string): boolean {
  return /^[\w-]{1,128}$/.test(cartId);
}

// Helper function to get cart key with validated input
const getCartKey = (cartId: string) => `cart:${cartId}`;

/**
 * Validates that a parsed CartItem has the expected shape and types.
 */
function isValidCartItem(
  item: unknown,
): item is CartItem {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    obj.id.length <= 256 &&
    typeof obj.color === 'string' &&
    obj.color.length > 0 &&
    obj.color.length <= 64 &&
    typeof obj.size === 'string' &&
    obj.size.length > 0 &&
    obj.size.length <= 64 &&
    typeof obj.quantity === 'number' &&
    Number.isInteger(obj.quantity) &&
    obj.quantity > 0 &&
    obj.quantity <= 9999
  );
}

// 22 hours in seconds
const CART_TTL = 22 * 60 * 60;

// GET /api/[cartId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cartId: string }> },
) {
  const { cartId } = await params;

  if (!isValidCartId(cartId)) {
    return NextResponse.json(
      { error: 'Invalid cart ID format' },
      { status: 400 },
    );
  }

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

  if (!isValidCartId(cartId)) {
    return NextResponse.json(
      { error: 'Invalid cart ID format' },
      { status: 400 },
    );
  }

  // Validate Content-Type
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 },
    );
  }

  // Enforce body size limit
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 },
    );
  }

  try {
    const cartKey = getCartKey(cartId);
    const item: unknown = await request.json();

    if (!isValidCartItem(item)) {
      return NextResponse.json(
        { error: 'Invalid cart item: must include id, color, size, and a positive integer quantity' },
        { status: 400 },
      );
    }

    // Get existing cart or create new one
    const existingCart = (await redis.get<Cart>(cartKey)) || {
      id: cartId,
      items: [],
    };

    // Enforce cart size limit
    if (existingCart.items.length >= MAX_CART_ITEMS) {
      return NextResponse.json(
        { error: 'Cart is full' },
        { status: 400 },
      );
    }

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

  if (!isValidCartId(cartId)) {
    return NextResponse.json(
      { error: 'Invalid cart ID format' },
      { status: 400 },
    );
  }

  // Validate Content-Type
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 },
    );
  }

  try {
    const cartKey = getCartKey(cartId);
    const item: unknown = await request.json();

    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).color !== 'string' ||
      typeof (item as Record<string, unknown>).size !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid item: must include id, color, and size' },
        { status: 400 },
      );
    }

    const validItem = item as { id: string; color: string; size: string };

    // Get existing cart
    const existingCart = await redis.get<Cart>(cartKey);

    if (!existingCart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }

    // Find the index of the matching item
    const itemIndex = existingCart.items.findIndex(
      (i) =>
        i.id === validItem.id &&
        i.color === validItem.color &&
        i.size === validItem.size,
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
