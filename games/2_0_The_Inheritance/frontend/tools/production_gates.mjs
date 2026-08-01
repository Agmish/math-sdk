import { preview } from 'vite';

const server = await preview({
  preview: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
});

try {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite preview did not expose a TCP port.');
  process.env.GAME_URL = `http://127.0.0.1:${address.port}`;
  await import('./rgs_acceptance.mjs');
  await import('./visual_smoke.mjs');
} finally {
  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => error ? reject(error) : resolve());
  });
}
