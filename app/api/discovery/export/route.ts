import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";
import {
  DISCOVERY_SECTIONS,
  QUESTIONNAIRE_TITLE,
} from "@/app/lib/discovery/questions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * GET /api/discovery/export?k=...
 *
 * Assembles the whole questionnaire — questions, answers, links, uploaded
 * files — into one Markdown document and returns it as a download. This is
 * the artifact the team sends back to Claude.ai to generate the build
 * prompts, so it mirrors the structure of the source questionnaire doc.
 */
export async function GET(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  }

  const [answers, links, attachments] = await Promise.all([
    prisma.discoveryAnswer.findMany(),
    prisma.discoveryLink.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.discoveryAttachment.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const answerByKey = new Map(answers.map((a) => [a.questionKey, a]));
  const linksByKey = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByKey.get(link.questionKey) ?? [];
    list.push(link);
    linksByKey.set(link.questionKey, list);
  }
  const filesByKey = new Map<string, typeof attachments>();
  for (const file of attachments) {
    const list = filesByKey.get(file.questionKey) ?? [];
    list.push(file);
    filesByKey.set(file.questionKey, list);
  }

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const lines: string[] = [
    `# ${QUESTIONNAIRE_TITLE} — Answers`,
    "",
    `*Exported ${now.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} from the HHI discovery portal.*`,
    "",
    "---",
    "",
  ];

  let answeredCount = 0;
  let totalCount = 0;

  for (const section of DISCOVERY_SECTIONS) {
    const star = section.star ? " ⭐" : "";
    lines.push(`### Section ${section.num} — ${section.title}${star}`);
    lines.push("");

    for (const question of section.questions) {
      totalCount += 1;
      if (question.subheading) {
        lines.push(`**${question.subheading}**`);
        lines.push("");
      }

      lines.push(`**${question.num}.** ${question.text}`);
      lines.push("");

      const answer = answerByKey.get(question.key);
      const questionLinks = linksByKey.get(question.key) ?? [];
      const questionFiles = filesByKey.get(question.key) ?? [];
      const hasContent =
        !!answer?.answerText.trim() || questionLinks.length > 0 || questionFiles.length > 0;
      if (hasContent) answeredCount += 1;

      if (answer?.answerText.trim()) {
        for (const line of answer.answerText.trim().split("\n")) {
          lines.push(`> ${line}`);
        }
        const by = answer.updatedBy ? ` — ${answer.updatedBy}` : "";
        lines.push(
          `> *(${answer.updatedAt.toLocaleDateString("en-US")}${by})*`,
        );
      } else if (questionLinks.length === 0 && questionFiles.length === 0) {
        lines.push("> *(no answer yet)*");
      }
      lines.push("");

      if (questionLinks.length > 0) {
        lines.push("Links:");
        for (const link of questionLinks) {
          const label = link.label || link.url;
          lines.push(`- [${label}](${link.url})`);
        }
        lines.push("");
      }

      if (questionFiles.length > 0) {
        lines.push("Attached files:");
        for (const file of questionFiles) {
          const size = formatBytes(file.sizeBytes);
          lines.push(`- [${file.fileName}](${file.publicUrl})${size ? ` (${size})` : ""}`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  lines.splice(4, 0, `**Progress: ${answeredCount} of ${totalCount} questions answered.**`, "");

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="HHI-Discovery-Answers-${dateStamp}.md"`,
    },
  });
}
