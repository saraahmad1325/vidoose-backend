/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */

import { Worker } from 'bullmq';
import { redisConnection } from './config/redis';
import { connectDB } from './config/db';
import { Job } from './models/job.model';
import { env } from './config/env';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

const execPromise = util.promisify(exec);

console.log('[Worker] Service Starting...');

connectDB();

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Helper: Find cookies file
const getCookiePath = () => {
  const distPath = path.join(process.cwd(), 'dist', 'config', 'cookies.txt');
  if (fs.existsSync(distPath)) return distPath;

  const srcPath = path.join(process.cwd(), 'src', 'config', 'cookies.txt');
  if (fs.existsSync(srcPath)) return srcPath;

  const localConfigPath = path.join(__dirname, 'config', 'cookies.txt');
  if (fs.existsSync(localConfigPath)) return localConfigPath;
  
  if (process.env.YOUTUBE_COOKIES) {
    const tempCookiePath = path.join(tempDir, 'youtube_cookies.txt');
    fs.writeFileSync(tempCookiePath, process.env.YOUTUBE_COOKIES);
    return tempCookiePath;
  }
  return null;
};

// Helper: Find the downloaded file
const findDownloadedFile = (jobId: string) => {
  const files = fs.readdirSync(tempDir);
  // Find file that starts with jobId (ignoring extension)
  return files.find(file => file.startsWith(jobId));
};

const worker = new Worker('video-download-queue', async (job) => {
  console.log(`⚡ Processing Job: ${job.id}`);
  const { jobId, url } = job.data;

  try {
    await Job.findByIdAndUpdate(jobId, { status: 'processing' });
    console.log(`🎬 downloading: ${url}`);

    const cookieFile = getCookiePath();
    const outputTemplate = path.join(tempDir, `${jobId}.%(ext)s`);

    // --- STEP 1: DOWNLOAD TO SERVER (TEMP) ---
    // We use yt-dlp to download the file locally first
    let command = `yt-dlp --no-warnings --no-progress -o "${outputTemplate}" "${url}"`;
    
    if (cookieFile) {
      command += ` --cookies "${cookieFile}"`;
    }

    command += ` --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`;
    
    // Execute download
    await execPromise(command);

    // --- STEP 2: EXTRACT METADATA (JSON) ---
    // We get metadata separately to be safe
    let metaCommand = `yt-dlp --dump-single-json --no-warnings "${url}"`;
    if (cookieFile) metaCommand += ` --cookies "${cookieFile}"`;
    
    const { stdout } = await execPromise(metaCommand);
    const videoData = JSON.parse(stdout);

    const metadata = {
      title: videoData.title || 'Unknown Title',
      duration: videoData.duration || 0,
      thumbnail: videoData.thumbnail || '',
      view_count: videoData.view_count || 0,
      uploader: videoData.uploader || 'Unknown',
      platform: videoData.extractor || 'web'
    };

    // --- STEP 3: UPLOAD TO CLOUDINARY ---
    const filename = findDownloadedFile(jobId);
    if (!filename) {
      throw new Error('File downloaded but not found in temp folder');
    }
    
    const filePath = path.join(tempDir, filename);
    console.log(`☁️ Uploading to Cloudinary: ${filename}`);

    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'vidoose_temp',
      public_id: jobId,
      eager: [
        { width: 300, height: 300, crop: "pad", audio_codec: "none" }
      ]
    });

    // --- STEP 4: CLEANUP & SAVE ---
    // Delete local file to save space
    fs.unlinkSync(filePath);
    console.log(`🧹 Local file deleted: ${filename}`);

    const finalDownloadUrl = uploadResult.secure_url;

    await Job.findByIdAndUpdate(jobId, { 
      status: 'ready',
      metadata: metadata,
      downloadUrl: finalDownloadUrl 
    });

    console.log(`🎉 Job ${jobId} completed. Link: ${finalDownloadUrl}`);

  } catch (err: any) {
    console.error(`❌ Job ${jobId} failed:`, err.message);
    await Job.findByIdAndUpdate(jobId, { status: 'failed', error: err.message });
  }
}, {
  connection: redisConnection,
  concurrency: 2 // Lower concurrency because downloading/uploading is heavy
});

worker.on('completed', job => {
  console.log(`✅ Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`❌ Job ${job?.id} has failed with ${err.message}`);
});
