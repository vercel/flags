import http from 'node:http';

const PORT = 3030;

const connectedClients = new Set();

const d = () => {
  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':');
};

setInterval(() => {
  console.log(`${d()} connected clients: ${connectedClients.size}`);
}, 1000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const intervalParam = url.searchParams.get('interval');
  const interval = intervalParam ? Number.parseInt(intervalParam, 10) : 1000;

  if (Number.isNaN(interval) || interval < 100) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid interval parameter. Must be a number >= 100ms');
    return;
  }

  const clientId = Math.random().toString(36).substring(2, 15);

  console.log(`${d()} client ${clientId} connected`);
  connectedClients.add(clientId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const intervalId = setInterval(() => {
    const data = JSON.stringify({
      projectId: 'prj_123',
      environment: 'development',
      definitions: {
        'free-delivery': {
          variants: [false, true],
          environments: { development: 0 },
        },
        'summer-sale': {
          variants: [false, true],
          environments: { development: 0 },
        },
        'proceed-to-checkout-color': {
          variants: ['blue', 'green', 'red'],
          environments: { development: Date.now() % 3 },
        },
      },
      segments: {},
    });
    res.write(data);
  }, interval);

  req.on('close', () => {
    clearInterval(intervalId);
    console.log(`${d()} client ${clientId} disconnected`);
    connectedClients.delete(clientId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Usage: http://localhost:${PORT}?interval=1000 (interval in milliseconds)`,
  );
});
