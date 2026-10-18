import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseReplyFallback } from "./reply-fallback";
import type { ExtractedConstraint } from "../types/contracts";

const candidates = [
  { start: "2026-10-20T16:00:00Z", end: "2026-10-20T18:00:00Z", freeUserIds: ["user"] },
  { start: "2026-10-21T16:00:00Z", end: "2026-10-21T18:00:00Z", freeUserIds: ["user"] },
];
const constraint = (kind: ExtractedConstraint["kind"], value: string): ExtractedConstraint =>
  ({ kind, value, scope: "proposal", confidence: 1, evidence: value });

test("all six fallback activities can be selected and use only filtered candidate slots", () => {
  const titles = new Set<string>();
  for (let index = 0; index < 6; index += 1) {
    const proposal = chooseReplyFallback(candidates, [], () => (index + 0.5) / 6);
    titles.add(proposal.title);
    assert.ok(candidates.some(slot => slot.start === proposal.start && slot.end === proposal.end));
    assert.ok(proposal.assumptions.some(text => text.includes("still need to confirm")));
  }
  assert.equal(titles.size, 6);
});

test("indoor and outdoor constraints restrict the activity pool", () => {
  for (const value of [0, 0.25, 0.5, 0.99]) {
    const indoor = chooseReplyFallback(candidates, [constraint("venue", "indoor")], () => value);
    assert.doesNotMatch(indoor.activity, /outdoor/);
    const outdoor = chooseReplyFallback(candidates, [constraint("venue", "outside")], () => value);
    assert.match(outdoor.activity, /outdoor/);
  }
});

test("an explicit alternative activity is preserved rather than replaced randomly", () => {
  for (const value of [0, 0.99]) {
    const result = chooseReplyFallback(candidates, [constraint("activity", "bowling")], () => value);
    assert.equal(result.title, "Bowling");
    assert.equal(result.activity, "bowling");
  }
});

test("single-slot input works, but empty slots and conflicting venues are rejected", () => {
  assert.equal(chooseReplyFallback([candidates[0]], [], () => 0.99).start, candidates[0].start);
  assert.throws(() => chooseReplyFallback([], []), /No candidate slots/);
  assert.throws(() => chooseReplyFallback(candidates,
    [constraint("venue", "indoor"), constraint("venue", "outdoor")]), /Conflicting/);
});
