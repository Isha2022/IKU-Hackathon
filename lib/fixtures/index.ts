import type {
  AppState,
  Belief,
  BeliefRevision,
  BusyBlock,
  Proposal,
  ScriptedAgentRun,
  User,
} from "../types";

export const users = [
  { id: "yonna", name: "Yonna" },
  { id: "isha", name: "Isha" },
  { id: "agrima", name: "Agrima" },
] satisfies User[];

// Busy intervals are stored in UTC, including across the UK clock change on 25 October.
export const busyBlocks = [
  { id: "bb-001", userId: "yonna", start: "2026-10-19T08:00:00Z", end: "2026-10-19T10:00:00Z" },
  { id: "bb-002", userId: "isha", start: "2026-10-19T09:00:00Z", end: "2026-10-19T12:00:00Z" },
  { id: "bb-003", userId: "agrima", start: "2026-10-19T12:00:00Z", end: "2026-10-19T15:00:00Z" },
  { id: "bb-004", userId: "yonna", start: "2026-10-20T12:00:00Z", end: "2026-10-20T15:00:00Z" },
  { id: "bb-005", userId: "isha", start: "2026-10-20T08:00:00Z", end: "2026-10-20T11:00:00Z" },
  { id: "bb-006", userId: "agrima", start: "2026-10-20T08:30:00Z", end: "2026-10-20T11:30:00Z" },
  { id: "bb-007", userId: "yonna", start: "2026-10-21T09:00:00Z", end: "2026-10-21T12:00:00Z" },
  { id: "bb-008", userId: "isha", start: "2026-10-21T12:00:00Z", end: "2026-10-21T16:00:00Z" },
  { id: "bb-009", userId: "agrima", start: "2026-10-21T08:00:00Z", end: "2026-10-21T11:00:00Z" },
  { id: "bb-010", userId: "yonna", start: "2026-10-22T08:00:00Z", end: "2026-10-22T11:00:00Z" },
  { id: "bb-011", userId: "isha", start: "2026-10-22T09:00:00Z", end: "2026-10-22T12:00:00Z" },
  { id: "bb-012", userId: "agrima", start: "2026-10-22T12:00:00Z", end: "2026-10-22T16:00:00Z" },
  { id: "bb-013", userId: "yonna", start: "2026-10-23T08:30:00Z", end: "2026-10-23T15:00:00Z" },
  { id: "bb-014", userId: "isha", start: "2026-10-23T08:00:00Z", end: "2026-10-23T11:30:00Z" },
  { id: "bb-015", userId: "agrima", start: "2026-10-23T09:00:00Z", end: "2026-10-23T16:00:00Z" },
  { id: "bb-016", userId: "yonna", start: "2026-10-24T08:00:00Z", end: "2026-10-24T11:00:00Z" },
  { id: "bb-017", userId: "isha", start: "2026-10-24T09:00:00Z", end: "2026-10-24T12:00:00Z" },
  { id: "bb-018", userId: "agrima", start: "2026-10-24T17:00:00Z", end: "2026-10-24T20:00:00Z" },
  { id: "bb-037", userId: "yonna", start: "2026-10-25T10:00:00Z", end: "2026-10-25T12:00:00Z" },
  { id: "bb-038", userId: "isha", start: "2026-10-25T12:00:00Z", end: "2026-10-25T14:00:00Z" },
  { id: "bb-039", userId: "agrima", start: "2026-10-25T08:00:00Z", end: "2026-10-25T10:00:00Z" },
  { id: "bb-019", userId: "yonna", start: "2026-10-26T08:00:00Z", end: "2026-10-26T11:00:00Z" },
  { id: "bb-020", userId: "isha", start: "2026-10-26T12:00:00Z", end: "2026-10-26T15:00:00Z" },
  { id: "bb-021", userId: "agrima", start: "2026-10-26T09:00:00Z", end: "2026-10-26T12:00:00Z" },
  { id: "bb-022", userId: "yonna", start: "2026-10-27T12:00:00Z", end: "2026-10-27T15:00:00Z" },
  { id: "bb-023", userId: "isha", start: "2026-10-27T08:00:00Z", end: "2026-10-27T11:00:00Z" },
  { id: "bb-024", userId: "agrima", start: "2026-10-27T08:30:00Z", end: "2026-10-27T11:30:00Z" },
  { id: "bb-025", userId: "yonna", start: "2026-10-28T09:00:00Z", end: "2026-10-28T12:00:00Z" },
  { id: "bb-026", userId: "isha", start: "2026-10-28T12:00:00Z", end: "2026-10-28T16:00:00Z" },
  { id: "bb-027", userId: "agrima", start: "2026-10-28T08:00:00Z", end: "2026-10-28T11:00:00Z" },
  { id: "bb-028", userId: "yonna", start: "2026-10-29T08:00:00Z", end: "2026-10-29T11:00:00Z" },
  { id: "bb-029", userId: "isha", start: "2026-10-29T09:00:00Z", end: "2026-10-29T12:00:00Z" },
  { id: "bb-030", userId: "agrima", start: "2026-10-29T12:00:00Z", end: "2026-10-29T16:00:00Z" },
  { id: "bb-031", userId: "yonna", start: "2026-10-30T08:30:00Z", end: "2026-10-30T15:00:00Z" },
  { id: "bb-032", userId: "isha", start: "2026-10-30T08:00:00Z", end: "2026-10-30T11:30:00Z" },
  { id: "bb-033", userId: "agrima", start: "2026-10-30T09:00:00Z", end: "2026-10-30T16:00:00Z" },
  { id: "bb-034", userId: "yonna", start: "2026-10-31T08:00:00Z", end: "2026-10-31T11:00:00Z" },
  { id: "bb-035", userId: "isha", start: "2026-10-31T09:00:00Z", end: "2026-10-31T12:00:00Z" },
  { id: "bb-036", userId: "agrima", start: "2026-10-31T17:00:00Z", end: "2026-10-31T20:00:00Z" },
  { id: "bb-040", userId: "yonna", start: "2026-11-01T10:00:00Z", end: "2026-11-01T12:00:00Z" },
  { id: "bb-041", userId: "isha", start: "2026-11-01T12:00:00Z", end: "2026-11-01T14:00:00Z" },
  { id: "bb-042", userId: "agrima", start: "2026-11-01T08:00:00Z", end: "2026-11-01T10:00:00Z" },
] satisfies BusyBlock[];

export const initialProposal = {
  slot: {
    start: "2026-10-23T17:30:00Z",
    end: "2026-10-23T20:00:00Z",
  },
  title: "Friday dinner and a catch-up",
  attendees: ["yonna", "isha", "agrima"],
  assumptions: [
    "Isha is free after lectures; her imported calendar does not show a Friday evening shift.",
    "Everyone can get to central London by 18:30 BST.",
    "A relaxed, low-cost dinner suits the group better than a late night out.",
  ],
  version: 1,
  reasoning:
    "The shared calendars show no conflicts from 18:30 to 21:00 BST, making Friday the earliest evening that appears to work for all three.",
} satisfies Proposal;

export const beliefs = [
  {
    id: "belief-yonna-friday",
    subjectUserId: "yonna",
    statement: "Yonna is available for a Friday evening meetup after 18:30 BST.",
    confidence: 0.94,
  },
  {
    id: "belief-isha-saturday",
    subjectUserId: "isha",
    statement: "Isha has no Saturday afternoon commitment that would prevent a meetup.",
    confidence: 0.61,
  },
  {
    id: "belief-isha-friday",
    subjectUserId: "isha",
    statement: "Isha is available for a Friday evening meetup after her lectures.",
    confidence: 0.82,
  },
  {
    id: "belief-isha-calendar",
    subjectUserId: "isha",
    statement: "Isha's imported calendar includes her regular work shifts.",
    confidence: 0.74,
  },
  {
    id: "belief-agrima-friday",
    subjectUserId: "agrima",
    statement: "Agrima is available after her Friday seminar.",
    confidence: 0.91,
  },
  {
    id: "belief-agrima-saturday",
    subjectUserId: "agrima",
    statement: "Agrima is free on Saturday afternoon, before her evening plans.",
    confidence: 0.86,
  },
] satisfies Belief[];

export const initialAppState: AppState = {
  users,
  busyBlocks,
  proposal: initialProposal,
  beliefs,
  revisions: [],
};

export const declineRevisions = [
  {
    time: "2026-10-20T14:05:00Z",
    beliefId: "belief-isha-friday",
    oldConfidence: 0.82,
    newConfidence: 0.05,
    trigger: "Isha declines: has a shift",
    explanation:
      "Isha explicitly said she is working Friday evening, so the calendar-based availability assumption is no longer reliable for this date.",
  },
  {
    time: "2026-10-20T14:05:10Z",
    beliefId: "belief-isha-calendar",
    oldConfidence: 0.74,
    newConfidence: 0.28,
    trigger: "Isha declines: has a shift",
    explanation:
      "The shift was not present in the imported busy blocks, which is direct evidence that Isha's calendar is missing at least some work commitments.",
  },
  {
    time: "2026-10-20T14:05:18Z",
    beliefId: "belief-isha-saturday",
    oldConfidence: 0.61,
    newConfidence: 0.77,
    trigger: "Re-checking shared free/busy blocks",
    explanation:
      "Isha's calendar is clear for Saturday afternoon, which supports availability, but the missing Friday shift means calendar-only evidence is not conclusive.",
  },
] satisfies BeliefRevision[];

export const revisedProposal = {
  slot: {
    start: "2026-10-24T14:00:00Z",
    end: "2026-10-24T16:00:00Z",
  },
  title: "Saturday afternoon coffee and a catch-up",
  attendees: ["yonna", "isha", "agrima"],
  assumptions: [
    "Isha's shift is limited to Friday evening; she has not mentioned a Saturday shift.",
    "The imported busy blocks are current through Saturday afternoon.",
    "A two-hour coffee meetup near central London works for everyone's travel plans.",
  ],
  version: 2,
  reasoning:
    "Friday no longer works because Isha has a shift. Saturday 15:00–17:00 BST is clear in all three calendars and leaves Agrima time before her evening plans; Isha's availability still needs confirmation because her shift was missing from the calendar.",
} satisfies Proposal;

const revisedBeliefs: Belief[] = beliefs.map((belief) => {
  if (belief.id === "belief-isha-friday") {
    return { ...belief, confidence: 0.05 };
  }
  if (belief.id === "belief-isha-calendar") {
    return { ...belief, confidence: 0.28 };
  }
  if (belief.id === "belief-isha-saturday") {
    return { ...belief, confidence: 0.77 };
  }
  return belief;
});

export const revisedAppState: AppState = {
  users,
  busyBlocks,
  proposal: revisedProposal,
  beliefs: revisedBeliefs,
  revisions: declineRevisions,
};

export const ishaDeclinesRun: ScriptedAgentRun = {
  scenario: "Isha declines: has a shift",
  steps: [
    {
      kind: "tool_call",
      name: "record_rsvp",
      payload: {
        proposalVersion: 1,
        userId: "isha",
        response: "declined",
        message: "I have a shift Friday evening, sorry!",
        receivedAt: "2026-10-20T14:05:00Z",
      },
    },
    {
      kind: "tool_result",
      name: "record_rsvp",
      payload: {
        saved: true,
        conflictingSlot: {
          start: "2026-10-23T17:30:00Z",
          end: "2026-10-23T20:00:00Z",
        },
      },
    },
    {
      kind: "tool_call",
      name: "revise_beliefs",
      payload: {
        evidence: "Isha says she has a work shift during the proposed slot.",
        beliefIds: ["belief-isha-friday", "belief-isha-calendar"],
      },
    },
    {
      kind: "tool_result",
      name: "revise_beliefs",
      payload: {
        revisions: declineRevisions.slice(0, 2),
        summary:
          "Lowered confidence in Isha's Friday availability and calendar completeness.",
      },
    },
    {
      kind: "tool_call",
      name: "find_shared_slots",
      payload: {
        attendeeIds: ["yonna", "isha", "agrima"],
        from: "2026-10-24T08:00:00Z",
        to: "2026-10-25T08:00:00Z",
        durationMinutes: 120,
      },
    },
    {
      kind: "tool_result",
      name: "find_shared_slots",
      payload: {
        slots: [
          {
            start: "2026-10-24T14:00:00Z",
            end: "2026-10-24T16:00:00Z",
          },
        ],
        allCalendarsClear: true,
      },
    },
    {
      kind: "tool_call",
      name: "revise_beliefs",
      payload: {
        beliefId: "belief-isha-saturday",
        evidence: "Shared free/busy query found Saturday afternoon clear.",
        confidence: 0.77,
      },
    },
    {
      kind: "final",
      name: "replan",
      payload: {
        revisions: declineRevisions,
        proposal: revisedProposal,
        explanation:
          "Friday was dropped because Isha is working. Saturday 15:00–17:00 BST is clear on the shared calendars, but Isha's availability is tentative until she confirms.",
      },
    },
  ],
  beliefRevisions: declineRevisions,
  proposal: revisedProposal,
};
