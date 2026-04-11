import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import {
  getGoogleReviewsApiKey,
  getGoogleReviewsPlaceId,
} from "@/app/integrations/google-reviews";

export const dynamic = "force-dynamic";

/**
 * POST /api/google-reviews/sync
 *
 * Fetches reviews from Google Places API (New).
 * Returns up to 5 reviews (official API limit).
 * Server-side only — API key never exposed to client.
 */
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await getGoogleReviewsApiKey();
  const placeId = await getGoogleReviewsPlaceId();

  if (!apiKey || !placeId) {
    return NextResponse.json(
      { error: "Google Reviews integration not configured. Add your API key and Place ID in Settings \u2192 Integrations." },
      { status: 400 }
    );
  }

  try {
    // Use Google Places API (New) — fields: reviews
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews,rating,userRatingCount&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json();

    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || `API error: ${data.error.status}` },
        { status: 502 }
      );
    }

    // Map reviews to our format
    const reviews = (data.reviews ?? []).slice(0, 5).map((r: {
      authorAttribution?: { displayName?: string };
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
      publishTime?: string;
    }, i: number) => ({
      id: `google-review-${i}`,
      reviewerName: r.authorAttribution?.displayName ?? "Anonymous",
      rating: r.rating ?? 5,
      text: r.text?.text ?? "",
      relativeTime: r.relativePublishTimeDescription ?? "",
      publishTime: r.publishTime ?? null,
    }));

    return NextResponse.json({
      reviews,
      placeRating: data.rating ?? null,
      totalReviews: data.userRatingCount ?? null,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch reviews" },
      { status: 502 }
    );
  }
}
