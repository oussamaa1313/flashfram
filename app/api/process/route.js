
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
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
      "-i", input,
      "-loop", "1",
      "-i", image,

      "-filter_complex",
      "[1:v]scale=iw*0.20:-1[wm];[0:v][wm]overlay=W-w-24:H-h-24:format=auto[v]",

      "-map", "[v]",
      "-map", "0:a?",

      "-c:v", "libx264",
      "-preset", "veryfast",
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

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            errorText.slice(-2000) ||
            `FFmpeg exited with code ${code}`
          )
        );
      }
    });
  });
}

export async function POST(request) {
  let tempDir;

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe secret key is missing." },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const sessionId = form.get("session_id");

    if (
      typeof sessionId !== "string" ||
      !/^cs_(test|live)_/.test(sessionId)
    ) {
      return NextResponse.json(
        { error: "A valid Stripe Checkout session is required." },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (
      session.payment_status !== "paid" ||
      session.amount_total !== 1000 ||
      session.currency !== "usd"
    ) {
      return NextResponse.json(
        { error: "Payment not verified. Complete the $10 checkout first." },
        { status: 402 }
      );
    }

    const files = form.getAll("videos").filter(
      (file) => file instanceof File && file.size > 0
    );

    if (files.length < 1 || files.length > 3) {
      return NextResponse.json(
        { error: "Choose between 1 and 3 videos." },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (
        !file.type.startsWith("video/") ||
        file.size > 250 * 1024 * 1024
      ) {
        return NextResponse.json(
          { error: "Each file must be a video smaller than 250 MB." },
          { status: 400 }
        );
      }
    }

    const imagePath = path.join(
      process.cwd(),
      "public",
      "cat-image.png"
    );

    const { access } = await import("node:fs/promises");

    try {
      await access(imagePath);
    } catch {
      return NextResponse.json(
        { error: "Missing public/cat-image.png." },
        { status: 400 }
      );
    }

    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "flashframe-")
    );

    const outputDir = path.join(
      process.cwd(),
      "public",
      "downloads"
    );

    await mkdir(outputDir, { recursive: true });

    const results = [];

    for (const file of files) {
      const id = randomUUID();

      const inputPath = path.join(tempDir, `${id}-input`);
      const outputName = `${id}.mp4`;
      const outputPath = path.join(outputDir, outputName);

      await writeFile(
        inputPath,
        Buffer.from(await file.arrayBuffer())
      );

      await runFFmpeg(inputPath, imagePath, outputPath);

      results.push({
        url: `/downloads/${outputName}`,
      });
    }

    return NextResponse.json({
      success: true,
      files: results,
    });

  } catch (error) {
    console.error("FlashFrame processing error:", error);

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
