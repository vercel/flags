import { NextRequest, NextResponse } from 'next/server';
import { Cart, CartItem } from '@/utils/cart-types';

// In a real application, this would be stored in a database
let cart: Cart = { items: [] };

export async function GET() {
  return NextResponse.json(cart);
}

export async function POST(request: NextRequest) {
  const item: CartItem = await request.json();

  // Find if item already exists with same color and size
  const existingItemIndex = cart.items.findIndex(
    (i) => i.color === item.color && i.size === item.size,
  );

  if (existingItemIndex >= 0) {
    // Update quantity if item exists
    cart.items[existingItemIndex].quantity += item.quantity;
  } else {
    // Add new item if it doesn't exist
    cart.items.push(item);
  }

  return NextResponse.json(cart);
}

export async function PUT(request: NextRequest) {
  const { color, size, quantity }: CartItem = await request.json();

  const itemIndex = cart.items.findIndex(
    (i) => i.color === color && i.size === size,
  );

  if (itemIndex === -1) {
    return NextResponse.json(
      { error: 'Item not found in cart' },
      { status: 404 },
    );
  }

  if (quantity <= 0) {
    // Remove item if quantity is 0 or negative
    cart.items.splice(itemIndex, 1);
  } else {
    // Update quantity
    cart.items[itemIndex].quantity = quantity;
  }

  return NextResponse.json(cart);
}

export async function DELETE(request: NextRequest) {
  const { color, size } = await request.json();

  const itemIndex = cart.items.findIndex(
    (i) => i.color === color && i.size === size,
  );

  if (itemIndex === -1) {
    return NextResponse.json(
      { error: 'Item not found in cart' },
      { status: 404 },
    );
  }

  cart.items.splice(itemIndex, 1);
  return NextResponse.json(cart);
}
