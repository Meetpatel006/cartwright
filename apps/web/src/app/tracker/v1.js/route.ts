import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Public Endpoint: Serves exclusively the Cartwright Tracker browser SDK bundle (v1.js).
 * Replaces static public hosting with a dedicated, CORS-enabled public endpoint.
 */
export async function GET(_request: NextRequest) {
  try {
    const cwd = process.cwd();
    const candidateDirs = [
      path.resolve(cwd, "packages/tracker/dist"),
      path.resolve(cwd, "../../packages/tracker/dist"),
      path.resolve(cwd, "../tracker/dist"),
    ];

    let filePath: string | null = null;
    for (const dir of candidateDirs) {
      const candidatePath = path.join(dir, "v1.js");
      if (fs.existsSync(candidatePath)) {
        filePath = candidatePath;
        break;
      }
    }

    if (!filePath) {
      return new NextResponse("/* Cartwright Tracker bundle not found. Run bun run build:tracker */", {
        status: 404,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const scriptContent = fs.readFileSync(filePath, "utf8");

    return new NextResponse(scriptContent, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS, HEAD",
        "Timing-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Failed to serve tracker bundle:", error);
    return new NextResponse("/* Failed to load tracker bundle */", {
      status: 500,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
