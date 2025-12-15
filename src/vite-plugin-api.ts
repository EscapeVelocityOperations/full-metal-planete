/**
 * Vite Plugin for integrating Fastify API server
 * Runs the backend within the Vite dev server process
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { FastifyInstance } from 'fastify';

export function apiServerPlugin(): Plugin {
  let fastifyServer: FastifyInstance | null = null;
  const API_PORT = 3000;

  return {
    name: 'vite-plugin-api-server',

    async configureServer(server: ViteDevServer) {
      // Dynamically import and start the Fastify server
      const { createServer } = await import('./server/api.js');

      fastifyServer = createServer();

      try {
        await fastifyServer.listen({ port: API_PORT, host: '0.0.0.0' });
        console.log(`\n  API server running on http://localhost:${API_PORT}`);
      } catch (err) {
        console.error('Failed to start API server:', err);
      }
    },

    async closeBundle() {
      if (fastifyServer) {
        await fastifyServer.close();
      }
    },
  };
}
