/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { buildApp } from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { redisConnection } from './config/redis';
import { flushAnalytics } from './cron/analytics.cron'; // Ensure you created this file

const start = async () => {
  const app = buildApp();
  
  // 1. Connect Database
  await connectDB();

  // 2. Start Server
  try {
    // Host 0.0.0.0 is required for Docker/Render
    await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
    console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    
    // 3. Start Background Cron Jobs (Analytics & Cleanup)
    console.log('⏰ Starting Background Cron Jobs...');
    
    // Run every 24 hours (86400000 ms)
    setInterval(() => {
      flushAnalytics().catch(err => console.error('❌ Analytics Flush Failed:', err));
    }, 24 * 60 * 60 * 1000);

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful Shutdown (Handle Ctrl+C or Docker Stop)
const shutdown = async () => {
  console.log('\n🛑 Shutting down server...');
  await redisConnection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();