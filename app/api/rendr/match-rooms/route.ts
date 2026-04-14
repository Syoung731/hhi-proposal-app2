import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

interface MatchRequest {
  unmatchedRendrLabels: string[];
  appRoomNames: string[];
  projectDescription?: string;
}

interface AIMatch {
  rendrLabel: string;
  appRoomName: string | null;
  confidence: number;
}

export async function POST(req: NextRequest) {
  await requireAdmin();

  const body = (await req.json()) as MatchRequest;
  const { unmatchedRendrLabels, appRoomNames, projectDescription } = body;

  if (!unmatchedRendrLabels?.length || !appRoomNames?.length) {
    return NextResponse.json({ matches: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 500 },
    );
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a room name matching assistant for a renovation estimating app.
You will be given a list of room labels from a LiDAR scan and a list of room names
from a renovation project. Match each scan label to the most likely project room.
Return ONLY a valid JSON array with no preamble or markdown formatting.`;

  const userPrompt = `Rendr scan labels to match: ${JSON.stringify(unmatchedRendrLabels)}
Project room names: ${JSON.stringify(appRoomNames)}
${projectDescription ? `Project context: ${projectDescription}` : ""}

Return a JSON array of objects: [{ "rendrLabel": string, "appRoomName": string | null, "confidence": number }]`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const matches: AIMatch[] = JSON.parse(text);
    return NextResponse.json({ matches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI matching failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
