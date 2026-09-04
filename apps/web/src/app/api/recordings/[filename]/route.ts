import { auth } from "@cartwright/auth";
import { connection, NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    // Session-gated + filesystem reads must run at request time, never during
    // prerendering (Cache Components would otherwise try to statically render
    // this GET route).
    await connection();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { filename } = await context.params;
    const safeFilename = path.basename(filename);
    if (!/\.(?:mp4|webm)$/i.test(safeFilename)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const cwd = process.cwd();
    const candidateDirs = [
      path.resolve(cwd, "packages/agent/recordings"),
      path.resolve(cwd, "../../packages/agent/recordings"),
      path.resolve(cwd, "../agent/recordings"),
    ];

    let filePath: string | null = null;
    for (const dir of candidateDirs) {
      const candidatePath = path.join(/*turbopackIgnore: true*/ dir, safeFilename);
      if (fs.existsSync(/*turbopackIgnore: true*/ candidatePath)) {
        filePath = candidatePath;
        break;
      }
    }

    if (!filePath) {
      return new NextResponse("File not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);
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
    console.error("Failed to read recording:", error);
    return new NextResponse("Failed to read recording", { status: 500 });
  }
}
