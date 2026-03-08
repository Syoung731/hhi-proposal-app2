import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { uploadBuffer } from "@/app/lib/s3";
import { MediaKind, MediaPlacement, MediaType } from "@/app/generated/prisma";

const ZILLOW_TAG = "zillow";

/** CORS so the Chrome extension can call this route. */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(res: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/**
 * Import Zillow photos into a project as unassigned EXISTING media tagged "zillow".
 * Body: { projectId: string, imageUrls: string[] }
 * Returns: { imported: number, skipped: number, failed: number } or { error: string }
 * Duplicate: skip if project already has Media with same sourceUrl and tag "zillow".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const rawUrls = Array.isArray(body?.imageUrls) ? body.imageUrls : [];
    const imageUrls = rawUrls
      .filter((u: unknown) => typeof u === "string" && u.trim().length > 0)
      .map((u: string) => u.trim());

    if (!projectId) {
      return withCors(NextResponse.json({ error: "projectId is required" }, { status: 400 }));
    }
    if (imageUrls.length === 0) {
      return withCors(
        NextResponse.json({ error: "imageUrls must be a non-empty array" }, { status: 400 })
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return withCors(NextResponse.json({ error: "Project not found" }, { status: 404 }));
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const sourceUrl of imageUrls) {
      try {
        const existing = await prisma.media.findFirst({
          where: {
            projectId,
            sourceUrl,
            tags: { has: ZILLOW_TAG },
          },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        const res = await fetch(sourceUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "image/*",
          },
        });
        if (!res.ok) {
          failed += 1;
          continue;
        }
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) {
          failed += 1;
          continue;
        }

        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
        const fileKey = `projects/${projectId}/zillow/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { publicUrl } = await uploadBuffer(fileKey, buffer, contentType);

        const maxOrder = await prisma.media
          .aggregate({
            where: { projectId, type: MediaType.EXISTING, roomId: null },
            _max: { sortOrder: true },
          })
          .then((r) => r._max.sortOrder ?? -1);

        await prisma.media.create({
          data: {
            projectId,
            roomId: null,
            kind: MediaKind.OTHER,
            type: MediaType.EXISTING,
            url: publicUrl,
            fileKey,
            sourceUrl,
            tags: [ZILLOW_TAG],
            sortOrder: maxOrder + 1,
            placement: MediaPlacement.UNASSIGNED,
          },
        });
        imported += 1;
      } catch {
        failed += 1;
      }
    }

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);

    return withCors(
      NextResponse.json({
        imported,
        skipped,
        failed,
      })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return withCors(NextResponse.json({ error: message }, { status: 500 }));
  }
}
