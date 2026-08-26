import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const cwd = process.cwd();
    const candidateDirs = [
      path.resolve(cwd, "packages/agent/recordings"),
      path.resolve(cwd, "../../packages/agent/recordings"),
      path.resolve(cwd, "../agent/recordings"),
    ];

    let recordingsDir: string | null = null;
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        recordingsDir = dir;
        break;
      }
    }

    if (!recordingsDir) {
      return NextResponse.json({ recordings: [] });
    }

    const files = fs
      .readdirSync(recordingsDir)
      .filter((file) => file.endsWith(".mp4") || file.endsWith(".webm"))
      .sort()
      .reverse();

    return NextResponse.json({ recordings: files });
  } catch (error) {
    return NextResponse.json({ recordings: [], error: String(error) });
  }
}
