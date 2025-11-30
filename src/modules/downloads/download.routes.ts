/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { FastifyInstance } from 'fastify';
import { startDownload, checkStatus, getDownloadLink } from './download.controller';

export async function downloadRoutes(fastify: FastifyInstance) {
  
  // ১. ভিডিও ডাউনলোড শুরু করা (User ID ক্যাপচার করার জন্য Auth দরকার)
  fastify.post('/start', { preHandler: [fastify.authenticate] }, startDownload);
  
  // ২. স্ট্যাটাস চেক করা (Premium ইউজার ডিটেক্ট করার জন্য Auth দরকার)
  fastify.get('/status/:id', { preHandler: [fastify.authenticate] }, checkStatus);
  
  // ৩. আসল লিঙ্ক আনলক করা (Ad Token এর সাথে User ID মেলানোর জন্য Auth দরকার)
  fastify.post('/get-link', { preHandler: [fastify.authenticate] }, getDownloadLink);
}