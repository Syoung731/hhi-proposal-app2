import type { SlideTestimonial } from "./deck/types";

export const DEFAULT_TESTIMONIALS: SlideTestimonial[] = [
  {
    id: "seed-1",
    quote:
      "From the very first meeting, we knew we were in good hands. The team was professional, communicative, and delivered exactly what they promised \u2014 on time and on budget.",
    clientName: "Christina Galbreath-Gonzalez",
    rating: 5,
    source: "manual",
  },
  {
    id: "seed-2",
    quote:
      "What impressed us most was the planning. There were no surprises, no change orders we didn\u2019t initiate. The finished result exceeded everything we imagined.",
    clientName: "Diane Zalewski",
    rating: 5,
    source: "manual",
  },
];

export const TESTIMONIALS_SLIDE_DEFAULTS = {
  headline: "What Our Clients Say",
  showStars: true,
} as const;
