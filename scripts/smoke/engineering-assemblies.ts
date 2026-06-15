import dotenv from "dotenv";
import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }) });

const SYN: Record<string, string> = { footer: "footing", ftg: "footing", cmu: "masonry", holddown: "holdown", strapping: "strap" };
const sing = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const canon = (w: string) => { const s = SYN[w] ?? w; return sing(SYN[s] ?? s); };
function tokenize(t: string): Set<string> { const o = new Set<string>(); for (const r of t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)) if (r) o.add(canon(r)); return o; }
function tagWords(tag: string): string[] { return tag.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map(canon); }

const scopes = [
  { label: "ADDITION (Steve's example)", scope: "We are doing an 18x20 addition, pour a concrete footer, and connect back into the existing slab. Frame new exterior walls and roof." },
  { label: "HURRICANE STRAP + GABLE ROOF", scope: "Install hurricane straps on the new framing and build out the gable end roof with proper uplift connections." },
  { label: "PORCH + DECK", scope: "Build a new screened porch with hollow box columns and attach a deck ledger to the house." },
  { label: "CMU FOUNDATION", scope: "New CMU foundation wall with grouted cells and a bond beam, bearing on a continuous spread footing." },
  { label: "COSMETIC (should be null)", scope: "Repaint all walls, install new luxury vinyl plank flooring, and replace the vanity and light fixtures." },
];

async function main() {
  const all = await prisma.engineeringAssembly.findMany({ where: { reviewStatus: "APPROVED", isActive: true }, select: { name: true, triggerKeywords: true, tags: true } });
  console.log("Loaded " + all.length + " APPROVED assemblies.");
  for (const { label, scope } of scopes) {
    const toks = tokenize(scope);
    const scored = all.map((a) => {
      const kws = [...(a.triggerKeywords ?? []), ...(a.tags ?? [])];
      let score = 0, compound = false; const matched: string[] = [];
      for (const raw of kws) { const w = tagWords(raw); if (!w.length) continue; const k = w.join(" "); if (matched.includes(k)) continue; if (w.every((x) => toks.has(x))) { matched.push(k); score++; if (w.length > 1) compound = true; } }
      return { name: a.name, score, include: compound || score >= 2, matched };
    }).filter((s) => s.include).sort((x, y) => y.score - x.score).slice(0, 5);
    console.log("\n========== " + label + " ==========");
    if (!scored.length) { console.log("-> null (no confident match - fails closed)"); continue; }
    for (const s of scored) console.log("   - [" + s.score + "] " + s.name + "  {" + s.matched.join(", ") + "}");
  }
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
