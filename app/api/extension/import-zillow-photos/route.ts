import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { uploadBuffer } from "@/app/lib/s3";
import { MediaKind, MediaPlacement, MediaType } from "@/app/generated/prisma";
import { verifyImportSession } from "@/app/lib/zillow-browser-connection";
import { redeemExtensionPairCode } from "@/app/lib/extension-pair-code";

const ZILLOW_TAG = "zillow";

/**
 * CORS rationale: this route is called from the Zillow Importer Chrome
 * extension, whose origin is `chrome-extension://<id>` rather than the
 * app origin. The browser blocks the request unless the server returns
 * `Access-Control-Allow-Origin: *` (or matches the extension origin).
 * The wildcard is acceptable because:
 *
 *   1. Auth is the `nonce` or `pairCode` in the body, not the origin.
 *      A request from any origin without a valid bearer is rejected with
 *      401 below.
 *   2. The bearer is short-lived (5 min before /verify, 24h after) and
 *      bound to a specific projectId.
 *
 * TODO(saas-phase): tighten origin to known extension IDs from
 * ZILLOW_EXTENSION_ALLOWLIST so a leaked bearer can't be used from a
 * non-allowlisted browser context.
 */
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
 * Body: {
 *   projectId: string,
 *   imageUrls: string[],
 *   nonce?: string,    // direct-handshake bearer (extension stores after /verify)
 *   pairCode?: string, // pair-code bearer (extension stores after /redeem-pair-code)
 * }
 * Auth: exactly one of `nonce` or `pairCode` must be supplied and verify
 * against a recently-paired session bound to this projectId. See the
 * IMPORT_SESSION_WINDOW_MS constants in zillow-browser-connection.ts and
 * extension-pair-code.ts (24h).
 * Returns: { imported: number, skipped: number, failed: number } or { error: string }
 * Duplicate: skip if project already has Media with same sourceUrl and tag "zillow".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const nonce = typeof body?.nonce === "string" ? body.nonce.trim() : "";
    const pairCode = typeof body?.pairCode === "string" ? body.pairCode.trim() : "";
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
    if (!nonce && !pairCode) {
      return withCors(
        NextResponse.json(
          { error: "Missing pairing credential — re-pair the extension" },
          { status: 401 },
        ),
      );
    }

    // Verify the bearer against the pairing session it came from.
    // Both paths return the projectId the credential is bound to; we then
    // require it match the projectId the caller asserted.
    const auth = nonce
      ? await verifyImportSession(nonce, projectId)
      : await redeemExtensionPairCode(pairCode);
    if ("error" in auth) {
      return withCors(NextResponse.json({ error: auth.error }, { status: 401 }));
    }
    if (auth.projectId !== projectId) {
      return withCors(
        NextResponse.json(
          { error: "Pairing credential does not match this project" },
          { status: 401 },
        ),
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
