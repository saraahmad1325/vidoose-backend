/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */
import { FastifyInstance } from 'fastify';
import { createKey } from './apikey.controller'; // Ensure controller exists

export async function apiKeyRoutes(fastify: FastifyInstance) {
  fastify.post('/create', { preHandler: [fastify.authenticate] }, createKey);
}