/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */
import { FastifyInstance } from 'fastify';
import { 
  register, 
  login, 
  verifyOTP, 
  verifyEmail, 
  forgotPassword, 
  resetPassword 
} from './auth.controller';

export async function authRoutes(fastify: FastifyInstance) {
  // Public Routes
  fastify.post('/register', register);
  fastify.post('/login', login); // This was missing the handler!
  fastify.post('/verify-otp', verifyOTP);
  
  fastify.get('/verify-email', verifyEmail); // Usually GET via link click
  fastify.post('/verify-email', verifyEmail); // Support POST if frontend handles it
  
  fastify.post('/forgot-password', forgotPassword);
  fastify.post('/reset-password', resetPassword);
}