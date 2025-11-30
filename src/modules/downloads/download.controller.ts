/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { Job } from '../../models/job.model';
import { User } from '../../models/user.model'; // Added User Model
import { addDownloadJob } from '../../utils/queue';
import { redisConnection } from '../../config/redis'; // Added Redis for Ad Token

// --- 1. Start Download Process ---
export const startDownload = async (req: FastifyRequest, reply: FastifyReply) => {
  console.log('🚀 [Step 1] Download request received');

  const { url } = req.body as any;
  const userId = req.user ? (req.user as any).id : null;
  
  try {
    const urlHash = crypto.createHash('md5').update(url).digest('hex');

    console.log('⏳ [Step 2] Creating Job in MongoDB...');
    
    // Create Job
    const job = await Job.create({
      userId,
      url,
      urlHash,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) 
    });
    console.log('✅ [Step 3] Job created in DB:', job._id);

    console.log('⏳ [Step 4] Adding to Redis Queue...');
    
    await addDownloadJob(job._id.toString(), url, userId?.toString());
    console.log('✅ [Step 5] Job added to Queue');

    return reply.send({ 
      message: 'Download started', 
      jobId: job._id,
      statusUrl: `/api/v1/downloads/status/${job._id}` 
    });

  } catch (error) {
    console.error('❌ [ERROR] Something failed:', error);
    return reply.status(500).send({ message: 'Internal Server Error', error });
  }
};

// --- 2. Check Job Status (FIXED: With Ad Gating) ---
export const checkStatus = async (req: FastifyRequest, reply: FastifyReply) => {
  const { id } = req.params as any;
  const userId = req.user ? (req.user as any).id : null;

  // Use .lean() to get a plain JavaScript object we can modify
  const job = await Job.findById(id).lean();
  
  if (!job) return reply.status(404).send({ message: 'Job not found' });
  
  // If job is not ready, return immediately (no link to hide yet)
  if (job.status !== 'ready') {
    return reply.send(job);
  }

  // --- AD GATING LOGIC ---
  let isPremium = false;

  if (userId) {
    const user = await User.findById(userId);
    // Check if user is Premium or Enterprise
    if (user && (user.plan === 'premium' || user.plan === 'enterprise')) {
      isPremium = true;
    }
  }

  // If user is NOT Premium (Free or Guest), HIDE the link
  if (!isPremium) {
    return reply.send({
      ...job,
      downloadUrl: null, // 🔒 MASKED: Hide the real link
      requiresAd: true,  // Frontend trigger
      adConfigUrl: '/api/v1/ads/config',
      unlockUrl: '/api/v1/downloads/get-link'
    });
  }

  // If Premium, return full job with link
  return reply.send(job);
};

// --- 3. Get Real Link (Unlock after Ad) ---
export const getDownloadLink = async (req: FastifyRequest, reply: FastifyReply) => {
  const { jobId, adToken } = req.body as any;
  const userId = req.user ? (req.user as any).id : 'guest';

  if (!jobId || !adToken) {
    return reply.status(400).send({ message: 'Missing Job ID or Ad Token' });
  }

  // Verify Ad Token from Redis
  const redisKey = `ad_token:${userId}:${jobId}`;
  const storedToken = await redisConnection.get(redisKey);

  if (!storedToken || storedToken !== adToken) {
    return reply.status(402).send({ 
      message: 'Invalid or expired Ad Token. Please watch ad again.',
      code: 'AD_VERIFICATION_FAILED' 
    });
  }

  // Fetch Job to get the link
  const job = await Job.findById(jobId);
  if (!job) return reply.status(404).send({ message: 'Job not found' });

  // Return the Real URL
  return reply.send({
    success: true,
    downloadUrl: job.downloadUrl,
    metadata: job.metadata
  });
};