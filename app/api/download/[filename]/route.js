
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function GET(request, context) {
  try {
    const { filename } = await context.params;

    if (!/^[a-f0-9-]{36}\.mp4$/i.test(filename)) {
      return NextResponse.json(
        { error: "Invalid download filename." },
        { status: 400 }
      );
    }

    if (!process.env.R2_BUCKET_NAME) {
      return NextResponse.json(
        { error: "R2 bucket configuration is missing." },
        { status: 500 }
      );
    }

    const objectKey = `processed/${filename.replace(".mp4", "")}.mp4`;

    const result = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey,
      })
    );

    if (!result.Body) {
      return NextResponse.json(
        { error: "Video not found." },
        { status: 404 }
      );
    }

    const stream = result.Body;

    return new Response(Readable.toWeb(stream), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(result.ContentLength || 0),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (error) {
    console.error("R2 download error:", error);

    if (
      error.name === "NoSuchKey" ||
      error.name === "NotFound"
    ) {
      return NextResponse.json(
        { error: "Video not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Download unavailable. Please try again." },
      { status: 500 }
    );
  }
}

