
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { filename } = await context.params;

    // Allow only generated UUID-based MP4 filenames.
    if (!/^[a-f0-9-]{36}\.mp4$/i.test(filename)) {
      return NextResponse.json(
        { error: "Invalid download filename." },
        { status: 400 }
      );
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "downloads",
      filename
    );

    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      return NextResponse.json(
        { error: "Video not found." },
        { status: 404 }
      );
    }

    const stream = createReadStream(filePath);

    return new Response(Readable.toWeb(stream), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileInfo.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Download error:", error);

    return NextResponse.json(
      { error: "Download file not found or unavailable." },
      { status: 404 }
    );
  }
}
