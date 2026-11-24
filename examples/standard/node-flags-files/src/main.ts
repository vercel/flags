import { runtime } from 'flags/runtime';
import { createServer } from './server.ts';

const server = await createServer();
const port = Number(process.env.PORT ?? 4440);
server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

// Close the providers when the process stops
process.on('SIGTERM', () => {
  server.close();
  void runtime.onShutdown();
});
