import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getRendrSpaceDetail } from "@/app/lib/rendr/rendrClient";
import { getRendrToken } from "@/app/lib/rendr/rendrClient";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spaceId: string; photoId: string }> },
) {
  await requireAdmin();
  const { spaceId, photoId } = await params;
  const id = Number(spaceId);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid space ID" }, { status: 400 });
  }

  try {
    // Fetch space detail to find the photo URL
    const space = await getRendrSpaceDetail(id);
    const photo = space.photos?.find((p: { id: string }) => p.id === photoId);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // Proxy the photo with auth
    const token = await getRendrToken();
    const upstream = await fetch(photo.space_photo_url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Photo fetch failed (${upstream.status})` },
        { status: upstream.status },
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "image/jpeg");
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch photo";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
