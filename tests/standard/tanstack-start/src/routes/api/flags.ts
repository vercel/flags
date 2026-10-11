import { createFileRoute } from '@tanstack/react-router';
import { evaluate } from 'flags';
import { bannerText, newCheckout } from '../../flags';

export const Route = createFileRoute('/api/flags')({
  server: {
    handlers: {
      GET: async () => {
        const [checkout, banner] = await evaluate([newCheckout, bannerText]);
        return Response.json({ checkout, banner });
      },
    },
  },
});
