
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

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
        { error: "Invalid filename." },
        { status: 400 }
      );
    }

    const result = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: `processed/${filename}`,
      })
    );

    if (!result.Body) {
      return NextResponse.json(
        { error: "Video not found." },
        { status: 404 }
      );
    }

    const stream = Readable.toWeb(result.Body);

    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(result.ContentLength),
        "Cache-Control": "private, no-store",
      },
    });

  } catch (error) {
    console.error("R2 download error:", error);

    return NextResponse.json(
      { error: "Video not found or unavailable." },
      { status: 404 }
    );
  }
}
