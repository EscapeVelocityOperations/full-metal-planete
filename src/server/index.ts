import { createServer } from './api.js';
import { initializeStorage, shutdownStorage, getStorage } from './storage/index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    // Initialize storage first
    console.log('Initializing storage...');
    const storage = await initializeStorage();
    console.log(`Storage connected (type: ${process.env.STORAGE_TYPE || 'memory'})`);

    // Create server with storage
    const server = createServer(storage);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      try {
        await server.close();
        console.log('Server closed');
        await shutdownStorage();
        console.log('Storage disconnected');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await server.listen({ port: PORT, host: HOST });
    console.log(`Server running on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
