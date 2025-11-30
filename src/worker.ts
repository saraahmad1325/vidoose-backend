/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { Worker } from 'bullmq';
import { redisConnection } from './config/redis';
import { connectDB } from './config/db';
import { Job } from './models/job.model';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

console.log('👷 Worker Service Starting...');

connectDB();

// Ensure temp directory exists for downloads
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const worker = new Worker('video-download-queue', async (job) => {
  console.log(`⚡ Processing Job: ${job.id}`);
  const { jobId, url } = job.data;

  try {
    // 1. Update status to processing
    await Job.findByIdAndUpdate(jobId, { status: 'processing' });

    console.log(`🎬 Extracting metadata for: ${url}`);

    // 2. REAL Command: Get JSON metadata using yt-dlp
    // We use --dump-single-json to get all info without downloading the video file yet
    const command = `yt-dlp --dump-single-json --no-warnings --no-call-home "${url}"`;
    
    // Execute command
    const { stdout } = await execPromise(command);
    const videoData = JSON.parse(stdout);

    // 3. Extract necessary info
    const metadata = {
      title: videoData.title || 'Unknown Title',
      duration: videoData.duration || 0,
      thumbnail: videoData.thumbnail || '',
      view_count: videoData.view_count || 0,
      uploader: videoData.uploader || 'Unknown',
      platform: videoData.extractor || 'web'
    };

    // 4. Get the best direct download link (yt-dlp provides this in the 'url' field of requested_formats or formats)
    // Note: For some sites, this link expires efficiently.
    // For a full system, we would download -> upload to Cloudinary. 
    // For now, let's extract the direct source link which is fastest.
    
    // Try to find a video with audio, or fallback to the generic url
    let downloadUrl = videoData.url; 
    
    // If formats exist, try to find mp4 with audio
    if (videoData.formats) {
        const bestFormat = videoData.formats.reverse().find((f: any) => 
            f.ext === 'mp4' && f.acodec !== 'none' && f.vcodec !== 'none'
        );
        if (bestFormat) {
            downloadUrl = bestFormat.url;
        }
    }

    console.log(`✅ Metadata extracted: ${metadata.title}`);

    // 5. Update Job with SUCCESS
    await Job.findByIdAndUpdate(jobId, { 
      status: 'ready',
      metadata: metadata,
      downloadUrl: downloadUrl 
    });

    console.log(`🎉 Job ${jobId} completed successfully.`);

  } catch (err: any) {
    console.error(`❌ Job ${jobId} failed:`, err.message);
    
    await Job.findByIdAndUpdate(jobId, { 
      status: 'failed', 
      error: err.message 
    });
    
    throw err;
  }
}, {
  connection: redisConnection,
  concurrency: 5 
});

worker.on('completed', job => {
  console.log(`✅ Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`❌ Job ${job?.id} has failed with ${err.message}`);
});