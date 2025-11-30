/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { env } from './config/env';

// --- Import All Routes ---
import { authRoutes } from './modules/auth/auth.routes';
import { downloadRoutes } from './modules/downloads/download.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { adRoutes } from './modules/ads/ad.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { seoRoutes } from './modules/seo/seo.routes';
import { apiKeyRoutes } from './modules/apikeys/apikey.routes';

export const buildApp = (): FastifyInstance => {
  // Trust Proxy is crucial for Render/Cloudflare to get real IP
  const app = fastify({ 
    logger: true, 
    trustProxy: true 
  });

  // --- 1. Global Security Plugins ---
  
  // CORS: Strict control for Production
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow localhost during development
      if (env.NODE_ENV === 'development') {
        cb(null, true);
        return;
      }
      
      // Production: Only allow official domains
      const allowedOrigins = [
        'https://vidoose.app', 
        'https://www.vidoose.app',
        'https://admin.vidoose.app'
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("🚫 Blocked by CORS: Unauthorized Domain"), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  app.register(helmet); // Secure Headers

  // JWT Setup
  app.register(jwt, { secret: env.JWT_ACCESS_SECRET });

  // Decorator to protect routes
  app.decorate("authenticate", async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ message: 'Unauthorized: Invalid Token' });
    }
  });

  // --- 2. Health Check (Vital for Render) ---
  app.get('/', async () => {
    return { 
      status: 'ok', 
      service: 'Vidoose API', 
      version: '1.0.0',
      env: env.NODE_ENV 
    };
  });

  app.get('/health', async () => {
    return { status: 'healthy', uptime: process.uptime() };
  });

  // --- 3. Register Application Modules ---

  // Auth & Users (Login, Register, OTP, Forgot Password)
  app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Core Video Downloader (Start, Status, Get Link)
  app.register(downloadRoutes, { prefix: '/api/v1/downloads' });

  // Admin Panel (User Management, Stats, Logs)
  app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // Advertisement System (Config, Verification)
  app.register(adRoutes, { prefix: '/api/v1/ads' });

  // Payments & Subscriptions (PayPal Webhook)
  app.register(paymentRoutes, { prefix: '/api/v1/payments' });

  // SEO & Sitemaps (For Google Indexing)
  app.register(seoRoutes, { prefix: '/api/v1/seo' });

  // API Monetization (Key Gen, Usage)
  app.register(apiKeyRoutes, { prefix: '/api/v1/apikeys' });

  return app;
};