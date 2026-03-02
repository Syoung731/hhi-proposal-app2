import { Client } from "@upstash/qstash";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}. Set it in .env.local.`);
  }
  return value;
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

async function main() {
  const QSTASH_URL = requireEnv("QSTASH_URL");
  const QSTASH_TOKEN = requireEnv("QSTASH_TOKEN");
  const PUBLIC_BASE_URL = requireEnv("PUBLIC_BASE_URL");

  const client = new Client({
    baseUrl: QSTASH_URL,
    token: QSTASH_TOKEN,
  });

  const url = `${stripTrailingSlashes(PUBLIC_BASE_URL)}/api/qstash/test`;
  const body = { hello: "world", ts: Date.now() };

  const res = await client.publishJSON({
    url,
    body,
  });

  console.log("✅ Published to:", url);
  console.log("QStash publish response:", res);
}

main().catch((err) => {
  console.error("❌ QStash test failed:", err);
  process.exit(1);
});