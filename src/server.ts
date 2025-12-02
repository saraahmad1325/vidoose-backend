/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { buildApp } from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { redisConnection } from './config/redis';
import { flushAnalytics } from './cron/analytics.cron';
import './worker'; // Monolith Worker

// 🔥 SELF-HEALING: Catch Unhandled Errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down...', err);
  // Log error to external service (Sentry) here in future
  process.exit(1); // PM2 will restart it automatically
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...', err);
  process.exit(1); // PM2 will restart it automatically
});

const start = async () => {
  const app = await buildApp(); // Note: Added await because buildApp is async now
  
  await connectDB();

  try {
    await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
    console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`📚 Docs available at https://${env.BACKEND_URL || 'localhost:3000'}/documentation`);
    
    // Cron Jobs
    setInterval(() => {
      flushAnalytics().catch(err => console.error('❌ Analytics Flush Failed:', err));
    }, 24 * 60 * 60 * 1000);

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful Shutdown
const shutdown = async () => {
  console.log('\n🛑 SIGTERM RECEIVED. Shutting down gracefully...');
  await redisConnection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();