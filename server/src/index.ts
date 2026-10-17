import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[GanttFlow] API berjalan di http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`[GanttFlow] Menerima ${signal}, menutup server...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
