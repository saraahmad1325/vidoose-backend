/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */
import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { ApiKey } from '../../models/apikey.model';

export const createKey = async (req: FastifyRequest, reply: FastifyReply) => {
  const user = req.user as any;
  const { name } = req.body as any;

  const rawKey = `vk_${crypto.randomBytes(24).toString('hex')}`; // vk_...
  const keyHash = crypto.createHmac('sha256', process.env.ADMIN_SECRET!).update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, 7);

  await ApiKey.create({
    ownerId: user.id,
    name,
    keyHash,
    prefix,
    tier: user.plan === 'enterprise' ? 'enterprise' : 'free',
    monthlyQuota: user.plan === 'enterprise' ? 100000 : 1000
  });

  // Show key ONCE
  return reply.send({ 
    message: 'API Key Created. Copy it now, you wont see it again.',
    apiKey: rawKey 
  });
};