/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { Job } from '../../models/job.model';
import { User } from '../../models/user.model';
import { addDownloadJob } from '../../utils/queue';
import { redisConnection } from '../../config/redis';

// --- Interfaces for Strict Typing ---
interface StartDownloadBody {
  url: string;
}

interface CheckStatusParams {
  id: string;
}

interface GetLinkBody {
  jobId: string;
  adToken: string;
}

interface HistoryQuery {
  page?: number;
  limit?: number;
}

// --- 1. Start Download Process (With Smart Caching & Validation) ---
export const startDownload = async (
  req: FastifyRequest<{ Body: StartDownloadBody }>, 
  reply: FastifyReply
) => {
  console.log('🚀 [Step 1] Download request received');

  const { url } = req.body;
  const userId = req.user ? (req.user as any).id : null;

  // 🛡️ VALIDATION: Basic URL check before processing
  if (!url || !url.startsWith('http')) {
    return reply.status(400).send({ message: 'Invalid URL provided' });
  }
  
  try {
    // Create a unique hash for the URL to use as Cache Key
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    const cacheKey = `meta:${urlHash}`;

    // 🔥 SMART CACHING: Check Redis before creating a new job
    const cachedData = await redisConnection.get(cacheKey);

    if (cachedData) {
      console.log('🚀 Serving from Cache (Zero Processing)');
      const cachedJob = JSON.parse(cachedData);
      
      return reply.send({ 
        message: 'Download started (Cached)', 
        jobId: cachedJob._id,
        statusUrl: `/api/v1/downloads/status/${cachedJob._id}` 
      });
    }

    // If NOT in cache, proceed with normal flow
    console.log('⏳ [Step 2] Creating Job in MongoDB...');
    
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

// --- 2. Check Job Status (With Ad Gating) ---
export const checkStatus = async (
  req: FastifyRequest<{ Params: CheckStatusParams }>, 
  reply: FastifyReply
) => {
  const { id } = req.params;
  const userId = req.user ? (req.user as any).id : null;

  try {
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

  } catch (error) {
    console.error('❌ [Status Check Error]:', error);
    return reply.status(500).send({ message: 'Error checking status' });
  }
};

// --- 3. Get Real Link (Unlock after Ad) ---
export const getDownloadLink = async (
  req: FastifyRequest<{ Body: GetLinkBody }>, 
  reply: FastifyReply
) => {
  const { jobId, adToken } = req.body;
  const userId = req.user ? (req.user as any).id : 'guest';

  if (!jobId || !adToken) {
    return reply.status(400).send({ message: 'Missing Job ID or Ad Token' });
  }

  try {
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
  } catch (error) {
    console.error('❌ [Get Link Error]:', error);
    return reply.status(500).send({ message: 'Error retrieving link' });
  }
};

// --- 4. Get User Download History (NEW FEATURE) ---
export const getDownloadHistory = async (
  req: FastifyRequest<{ Querystring: HistoryQuery }>, 
  reply: FastifyReply
) => {
  const userId = (req.user as any).id;
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    // Fetch jobs for this user
    const jobs = await Job.find({ userId, status: 'ready' })
      .select('url metadata createdAt status') // Select only necessary fields
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(Number(limit));

    const total = await Job.countDocuments({ userId, status: 'ready' });

    return reply.send({
      success: true,
      data: jobs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('❌ [History Error]:', error);
    return reply.status(500).send({ message: 'Error fetching history' });
  }
};