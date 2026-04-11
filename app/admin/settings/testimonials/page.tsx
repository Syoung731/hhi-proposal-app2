import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { TestimonialsSettingsClient } from "./TestimonialsSettingsClient";

export const dynamic = "force-dynamic";

export default async function TestimonialsSettingsPage() {
  await requireAdmin();

  // Seed defaults if empty
  const count = await prisma.testimonial.count();
  if (count === 0) {
    await prisma.testimonial.createMany({
      data: [
        {
          quote: "From the very first meeting, we knew we were in good hands. The team was professional, communicative, and delivered exactly what they promised \u2014 on time and on budget.",
          clientName: "Christina Galbreath-Gonzalez",
          rating: 5,
          source: "manual",
          approved: true,
          sortOrder: 0,
        },
        {
          quote: "What impressed us most was the planning. There were no surprises, no change orders we didn\u2019t initiate. The finished result exceeded everything we imagined.",
          clientName: "Diane Zalewski",
          rating: 5,
          source: "manual",
          approved: true,
          sortOrder: 1,
        },
      ],
    });
  }

  const testimonials = await prisma.testimonial.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return <TestimonialsSettingsClient initialTestimonials={testimonials} />;
}
