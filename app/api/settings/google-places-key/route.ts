import { NextRequest, NextResponse } from "next/server";
import { getGooglePlacesApiKey } from "@/app/integrations/google-places";

// Hilton Head Island, SC approximate coordinates for biasing
const HHI_LAT = 32.2163;
const HHI_LNG = -80.7526;

/**
 * GET /api/settings/google-places-key
 * Returns whether a Google Places API key is configured (does NOT expose the key).
 */
export async function GET() {
  const apiKey = await getGooglePlacesApiKey();
  return NextResponse.json({ configured: !!apiKey });
}

/**
 * POST /api/settings/google-places-key
 * Proxies Google Places API requests server-side (REST API doesn't support CORS).
 * Body: { action: "autocomplete", input: string } or { action: "details", placeId: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "No Google Places API key configured" }, { status: 400 });
  }

  const body = await req.json();

  if (body.action === "autocomplete") {
    const input = body.input?.trim();
    if (!input) return NextResponse.json({ predictions: [] });

    const params = new URLSearchParams({
      input,
      types: "address",
      components: "country:us",
      location: `${HHI_LAT},${HHI_LNG}`,
      radius: "50000",
      key: apiKey,
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await res.json();
    return NextResponse.json(data);
  }

  if (body.action === "details") {
    const placeId = body.placeId?.trim();
    if (!placeId) return NextResponse.json({ error: "placeId required" }, { status: 400 });

    const params = new URLSearchParams({
      place_id: placeId,
      fields: "address_components",
      key: apiKey,
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await res.json();
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
