
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

function runFFmpeg(input, image, output) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel", "warning",
      "-filter_threads", "1",
      "-filter_complex_threads", "1",

      "-i", input,
      "-loop", "1",
      "-i", image,

      "-filter_complex",
      "[1:v][0:v]scale2ref=w=rw:h=rh:force_original_aspect_ratio=disable[cat][base];[cat]setsar=1[fullcat];[base][fullcat]overlay=0:0:enable='lt(mod(t,2),0.03)':eof_action=repeat:format=auto[v]",

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

      if (errorText.length > 15000) {
        errorText = errorText.slice(-15000);
      }
    });

    proc.on("error", (error) => {
      reject(
        new Error(
          `Unable to start FFmpeg: ${error.message}`
        )
      );
    });

    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg failed. Exit code: ${code}, Signal: ${signal}\n${errorText.slice(-5000)}`
          )
        );
      }
    });
  });
}

export async function POST(request) {
  let tempDir;
  const outputFiles = [];

  try {
    // Check Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe secret key is missing." },
        { status: 500 }
      );
    }

    // Read form data
    const form = await request.formData();
    const sessionId = form.get("session_id");

    // Validate Stripe session
    if (
      typeof sessionId !== "string" ||
      !/^cs_(test|live)_/.test(sessionId)
    ) {
      return NextResponse.json(
        {
          error: "A valid Stripe Checkout session is required."
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

    // Retrieve payment
    const session = await stripe.checkout.sessions.retrieve(
      sessionId
    );

    // Verify $10 USD payment
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

    // Allow 1 to 3 videos
    if (files.length < 1 || files.length > 3) {
      return NextResponse.json(
        { error: "Choose between 1 and 3 videos." },
        { status: 400 }
      );
    }

    // Validate videos
    for (const file of files) {
      if (
        !file.type.startsWith("video/") ||
        file.size > 250 * 1024 * 1024
      ) {
        return NextResponse.json(
          {
            error: "Each file must be a video smaller than 250 MB."
          },
          { status: 400 }
        );
      }
    }

    // Cat image path
    const imagePath = path.join(
      process.cwd(),
      "public",
      "cat-image.png"
    );

    // Check image exists
    try {
      await access(imagePath);
    } catch {
      return NextResponse.json(
        { error: "Missing public/cat-image.png." },
        { status: 400 }
      );
    }

    // Create temporary directory
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "flashframe-")
    );

    // Create downloads directory
    const outputDir = path.join(
      process.cwd(),
      "public",
      "downloads"
    );

    await mkdir(outputDir, {
      recursive: true,
    });

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
        outputDir,
        outputName
      );

      // Save uploaded video
      await writeFile(
        inputPath,
        Buffer.from(await file.arrayBuffer())
      );

      // Register output for cleanup
      outputFiles.push(outputPath);

      // Apply full-screen cat image
      await runFFmpeg(
        inputPath,
        imagePath,
        outputPath
      );

      results.push({
        url: `/api/download/${outputName}`,
      });
    }

    // Return processed videos
    return NextResponse.json({
      success: true,
      files: results,
    });

  } catch (error) {
    console.error(
      "FlashFrame processing error:",
      error
    );

    // Delete generated files if processing fails
    for (const file of outputFiles) {
      await rm(file, {
        force: true,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        error:
          error.message ||
          "Video processing failed.",
      },
      { status: 500 }
    );

  } finally {
    // Remove temporary directory
    if (tempDir) {
      await rm(tempDir, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}
