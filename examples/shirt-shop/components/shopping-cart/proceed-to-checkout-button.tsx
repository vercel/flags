'use client';

export function ProceedToCheckoutButton({
  color,
  onClick,
}: {
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${color} cursor-pointer w-full rounded-full border border-transparent px-4 py-3 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50`}
      onClick={onClick}
    >
      Proceed to Checkout
    </button>
  );
}
