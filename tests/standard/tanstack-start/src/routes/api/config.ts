import { createFileRoute } from '@tanstack/react-router';
import { evaluate } from 'flags';
import { darkMode, greeting } from '../../default-flags';

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => {
        const [dark, text] = await evaluate([darkMode, greeting]);
        return Response.json({ dark, text });
      },
    },
  },
});
