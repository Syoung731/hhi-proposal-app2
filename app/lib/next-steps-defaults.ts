import type { NextStep, NextStepsLayoutKey } from "./deck/types";

export const HHI_DEFAULT_NEXT_STEPS: NextStep[] = [
  {
    id: "sign-contract",
    number: 1,
    title: "Sign the Design Contract",
    description:
      "Formalize the relationship and secure your project start date with a signed design agreement.",
  },
  {
    id: "measure-meeting",
    number: 2,
    title: "Schedule Your Measure Meeting",
    description:
      "We visit the space, take precise measurements, and document existing conditions to begin the design process.",
  },
  {
    id: "feasibility-study",
    number: 3,
    title: "Complete the Feasibility Study",
    description:
      "Our team produces a detailed feasibility analysis confirming scope, budget alignment, and any structural considerations.",
  },
  {
    id: "proposed-plan",
    number: 4,
    title: "Receive Your Proposed Plan",
    description:
      "We present your full architectural design, material selections, and fixed-price build contract for your approval.",
  },
];

export interface GlobalNextStepsSettings {
  defaultSteps: NextStep[];
  defaultLayout: NextStepsLayoutKey;
  defaultSectionLabel: string;
  defaultHeadline: string;
  defaultContactEmail: string;
  defaultContactPhone: string;
}

export const HHI_NEXT_STEPS_DEFAULTS: GlobalNextStepsSettings = {
  defaultSteps: HHI_DEFAULT_NEXT_STEPS,
  defaultLayout: "numbered-photo",
  defaultSectionLabel: "WHAT HAPPENS NEXT",
  defaultHeadline: "Your Path Forward",
  defaultContactEmail: "",
  defaultContactPhone: "",
};
