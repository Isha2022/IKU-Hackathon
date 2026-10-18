import type { ExtractedConstraint } from "../types/contracts";

type Candidate = { start: string; end: string; freeUserIds: string[] };
type Venue = "indoor" | "outdoor";

const activities: Array<{ title: string; activity: string; venue: Venue }> = [
  { title: "Coffee and a catch-up", activity: "a cafe catch-up", venue: "indoor" },
  { title: "Board games together", activity: "an indoor board-game session", venue: "indoor" },
  { title: "A relaxed meal together", activity: "a casual indoor meal", venue: "indoor" },
  { title: "A creative afternoon", activity: "an indoor drawing and chat session", venue: "indoor" },
  { title: "A walk and a catch-up", activity: "a relaxed outdoor walk", venue: "outdoor" },
  { title: "A park catch-up", activity: "an outdoor catch-up in a park", venue: "outdoor" },
];

/** Inputs must already be filtered against scheduling constraints and calendars. */
export function chooseReplyFallback(
  candidates: Candidate[],
  constraints: ExtractedConstraint[],
  random: () => number = Math.random,
) {
  if (!candidates.length) throw new Error("No candidate slots satisfy the reply constraints.");
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];
  const slot = pick(candidates);
  const requestedActivity = constraints.find(item => item.kind === "activity")?.value.trim();
  const venues = constraints.filter(item => item.kind === "venue").map(item => item.value.toLowerCase());
  const indoor = venues.some(value => value.includes("indoor"));
  const outdoor = venues.some(value => /outdoor|outside/.test(value));
  if (indoor && outdoor) throw new Error("Conflicting indoor and outdoor venue constraints.");
  const options = activities.filter(item => indoor ? item.venue === "indoor" : outdoor ? item.venue === "outdoor" : true);
  const option = requestedActivity
    ? { title: requestedActivity.replace(/^\w/, letter => letter.toUpperCase()), activity: requestedActivity }
    : pick(options);
  return {
    start: slot.start,
    end: slot.end,
    title: option.title,
    activity: option.activity,
    reasoning: "This alternative uses a shared calendar slot filtered against the recorded scheduling constraints and the reply's activity or venue requests.",
    assumptions: [
      "No recorded calendar conflict does not guarantee availability; attendees still need to confirm.",
      "Venue availability, opening hours, cost and any equipment have not been checked.",
    ],
  };
}
