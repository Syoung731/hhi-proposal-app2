/**
 * Strip markdown code fences (```json ... ```) from AI responses before JSON.parse.
 * Claude (unlike OpenAI's response_format) may wrap JSON in code fences.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}
