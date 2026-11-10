
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  rm,
  access,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  randomUUID,
  createHmac,
  createHash,
} from "node:crypto";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cloudflare R2 connection
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// FFmpeg processing
function runFFmpeg(input, image, output) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-filter_threads", "1",
      "-filter_complex_threads", "1",

      "-i", input,
      "-loop", "1",
      "-framerate", "30",
      "-i", image,

      "-filter_complex",
      "[1:v][0:v]scale2ref=w=rw:h=rh[img][base];[img]format=rgba[img2];[base][img2]overlay=0:0:enable='lt(mod(t,2),0.04)':eof_action=repeat:format=auto[v]",

      "-map", "[v]",
      "-map", "0:a?",

      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "23",
      "-pix_fmt", "yuv420p",

      "-c:a", "aac",
      "-b:a", "128k",

      "-shortest",
      "-movflags", "+faststart",

      output,
    ];

    const proc = spawn(ffmpegPath, args);

    let errorText = "";

    proc.stderr.on("data", (data) => {
      errorText += data.toString();

      if (errorText.length > 12000) {
        errorText = errorText.slice(-12000);
      }
    });

    proc.on("error", (error) => {
      reject(new Error(`FFmpeg startup failed: ${error.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg failed with code ${code}: ${errorText.slice(-4000)}`
          )
        );
      }
    });
  });
}

// Upload processed video to R2
async function uploadToR2(filePath, filename) {
  const fileInfo = await stat(filePath);

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: `processed/${filename}`,
      Body: createReadStream(filePath),
      ContentLength: fileInfo.size,
      ContentType: "video/mp4",
    })
  );
}

// Generate secure download URL
function createDownloadUrl(filename) {
  const expires = Math.floor(Date.now() / 1000) + 3600;

  const signature = createHmac(
    "sha256",
    process.env.DOWNLOAD_SECRET
  )
    .update(`${filename}:${expires}`)
    .digest("hex");

  return `/api/download/${filename}?expires=${expires}&signature=${signature}`;
}

// Main API
export async function POST(request) {
  let tempDir;
  let lockKey;
  let lockAcquired = false;

  try {
    // Check environment variables
    const required = [
      "STRIPE_SECRET_KEY",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "DOWNLOAD_SECRET",
    ];

    for (const key of required) {
      if (!process.env[key]) {
        return NextResponse.json(
          { error: `Missing environment variable: ${key}` },
          { status: 500 }
        );
      }
    }

    // Read upload form
    const form = await request.formData();
    const sessionId = form.get("session_id");

    if (
      typeof sessionId !== "string" ||
      !/^cs_(test|live)_/.test(sessionId)
    ) {
      return NextResponse.json(
        { error: "Invalid Stripe session." },
        { status: 400 }
      );
    }

    // Verify Stripe payment
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.retrieve(
      sessionId
    );

    if (
      session.payment_status !== "paid" ||
      session.amount_total !== 1000 ||
      session.currency !== "usd"
    ) {
      return NextResponse.json(
        { error: "Payment not verified." },
        { status: 402 }
      );
    }

    // Get uploaded videos
    const files = form.getAll("videos").filter(
      (file) =>
        file &&
        typeof file.arrayBuffer === "function" &&
        file.size > 0
    );

    if (files.length < 1 || files.length > 3) {
      return NextResponse.json(
        { error: "Choose between 1 and 3 videos." },
        { status: 400 }
      );
    }

    // Validate files
    for (const file of files) {
      if (
        !file.type.startsWith("video/") ||
        file.size > 250 * 1024 * 1024
      ) {
        return NextResponse.json(
          { error: "Each video must be smaller than 250 MB." },
          { status: 400 }
        );
      }
    }

    // Check cat image
    const imagePath = path.join(
      process.cwd(),
      "public",
      "cat-image.png"
    );

    try {
      await access(imagePath);
    } catch {
      return NextResponse.json(
        { error: "Missing public/cat-image.png." },
        { status: 400 }
      );
    }

    // Lock Stripe payment: one use only
    const paymentHash = createHash("sha256")
      .update(sessionId)
      .digest("hex");

    lockKey = `payment-locks/${paymentHash}.json`;

    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: lockKey,
          Body: JSON.stringify({
            sessionIdHash: paymentHash,
            createdAt: new Date().toISOString(),
          }),
          ContentType: "application/json",
          IfNoneMatch: "*",
        })
      );

      lockAcquired = true;
    } catch (error) {
      if (
        error.name === "PreconditionFailed" ||
        error.$metadata?.httpStatusCode === 412
      ) {
        return NextResponse.json(
          { error: "This payment has already been used." },
          { status: 409 }
        );
      }

      throw error;
    }

    // Temporary processing directory
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "flashframe-")
    );

    const results = [];

    // Process each video
    for (const file of files) {
      const id = randomUUID();

      const inputPath = path.join(
        tempDir,
        `${id}-input`
      );

      const outputName = `${id}.mp4`;

      const outputPath = path.join(
        tempDir,
        outputName
      );

      await writeFile(
        inputPath,
        Buffer.from(await file.arrayBuffer())
      );

      // Add cat image every 2 seconds
      await runFFmpeg(
        inputPath,
        imagePath,
        outputPath
      );

      // Upload final video to Cloudflare R2
      await uploadToR2(
        outputPath,
        outputName
      );

      // Return signed download URL
      results.push({
        filename: outputName,
        url: createDownloadUrl(outputName),
      });

      await rm(inputPath, { force: true });
      await rm(outputPath, { force: true });
    }

    return NextResponse.json({
      success: true,
      message: "Videos processed and uploaded to Cloudflare R2.",
      files: results,
    });

  } catch (error) {
    console.error("FlashFrame processing error:", error);

    // Release payment lock if processing failed
    if (lockAcquired && lockKey) {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: lockKey,
        })
      ).catch((deleteError) => {
        console.error("Payment lock cleanup failed:", deleteError);
      });
    }

    return NextResponse.json(
      {
        error: error.message || "Video processing failed.",
      },
      { status: 500 }
    );

  } finally {
    if (tempDir) {
      await rm(tempDir, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}
