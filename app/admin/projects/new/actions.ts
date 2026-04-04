"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { ensureCopeRoom } from "@/app/lib/ensure-cope-room";
import { ProjectStatus } from "@/app/generated/prisma";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function createProjectAction(formData?: FormData) {
  await requireAdmin();
  const title = (formData?.get("title") as string)?.trim() || "Untitled Project";
  let slug = slugify(title) || "project-" + Date.now();
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  const project = await prisma.project.create({
    data: {
      slug,
      status: ProjectStatus.DRAFT,
      title,
    },
  });
  await ensureCopeRoom(project.id);
  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${project.id}`);
}
