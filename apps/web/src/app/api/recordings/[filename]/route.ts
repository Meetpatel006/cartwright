import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params;
    const safeFilename = path.basename(filename);

    const cwd = process.cwd();
    const candidateDirs = [
      path.resolve(cwd, "packages/agent/recordings"),
      path.resolve(cwd, "../../packages/agent/recordings"),
      path.resolve(cwd, "../agent/recordings"),
    ];

    let filePath: string | null = null;
    for (const dir of candidateDirs) {
      const candidatePath = path.join(dir, safeFilename);
      if (fs.existsSync(candidatePath)) {
        filePath = candidatePath;
        break;
      }
    }

    if (!filePath) {
      return new NextResponse("File not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const contentType = safeFilename.endsWith(".webm") ? "video/webm" : "video/mp4";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return new NextResponse(String(error), { status: 500 });
  }
}
