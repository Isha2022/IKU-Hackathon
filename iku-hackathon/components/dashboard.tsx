"use client";

import Image from "next/image";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { WeekCalendar, type CalendarView } from "@/components/week-calendar";
import { beliefs, busyBlocks, users } from "@/lib/fixtures";
import { londonDateTimeToUtc } from "@/lib/time";
import type { BusyBlock, Proposal } from "@/lib/types";

type CreatedHangout = Proposal & { place: string };

const defaultInvitees = ["yonna", "isha"];

function formatSlot(start: string, end: string): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${date} · ${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

function findNextHangoutSlot(
  attendees: string[],
  blocks: BusyBlock[],
): { start: string; end: string } | null {
  const weekStart = new Date(Date.UTC(2026, 9, 19));

  for (let day = 0; day < 7; day += 1) {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + day);
    const localDate = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");

    for (let hour = 16; hour <= 20; hour += 1) {
      const start = londonDateTimeToUtc(
        localDate,
        `${String(hour).padStart(2, "0")}:00`,
      );
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const available = attendees.every(
        (userId) =>
          !blocks.some(
            (block) =>
              block.userId === userId &&
              Date.parse(block.start) < end.getTime() &&
              Date.parse(block.end) > start.getTime(),
          ),
      );

      if (available) {
        return { start: start.toISOString(), end: end.toISOString() };
      }
    }
  }

  return null;
}

function SparkleMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 2.75 14.3 9.7l6.95 2.3-6.95 2.3L12 21.25 9.7 14.3l-6.95-2.3L9.7 9.7 12 2.75Z"
        fill="currentColor"
      />
      <path
        d="m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Dashboard() {
  const [calendarView, setCalendarView] = useState<CalendarView>("availability");
  const [personalBlocks, setPersonalBlocks] = useState<BusyBlock[]>([]);
  const [inviteeIds, setInviteeIds] = useState(() => new Set(defaultInvitees));
  const [hangout, setHangout] = useState<CreatedHangout | null>(null);
  const [proposalSubmitted, setProposalSubmitted] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const invitees = users.filter((user) => inviteeIds.has(user.id));

  function toggleInvitee(userId: string) {
    setInviteeIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setHangout(null);
    setProposalSubmitted(false);
  }

  function createHangout() {
    setProposalError("");
    setProposalSubmitted(false);
    if (invitees.length === 0) {
      setProposalError("Choose at least one person to invite.");
      return;
    }

    const allBusyBlocks = [
      ...busyBlocks,
      ...personalBlocks.filter((block) => block.userId === "yonna"),
    ];
    // Replace this deterministic slot search with the shared free-slot API when it is ready.
    const slot = findNextHangoutSlot(
      invitees.map((user) => user.id),
      allBusyBlocks,
    );
    if (!slot) {
      setProposalError(
        "No two-hour shared slot was found this week. Try changing the invitees.",
      );
      setHangout(null);
      return;
    }

    setHangout({
      slot,
      title: "A catch-up together",
      attendees: invitees.map((user) => user.id),
      assumptions: [
        "Selected friends can make the suggested two-hour slot.",
        "The selected calendars show no busy blocks during this time.",
        "The group is happy to meet somewhere convenient for everyone.",
      ],
      version: 1,
      reasoning:
        "This is the earliest two-hour evening slot with no recorded conflicts for the invited friends.",
      // Place selection is intentionally not implemented yet; replace this placeholder with venue suggestions.
      place: "Place suggestions coming soon",
    });
  }

  function submitProposal() {
    // TODO: Persist the proposal and send an RSVP request to each invited attendee.
    setProposalSubmitted(true);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/90">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            aria-label="Where's Everyone? home"
            className="flex items-center gap-3"
            href="#"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-soft text-deep">
              <Image
                alt=""
                className="h-8 w-8 object-contain"
                height={83}
                priority
                src="/icon.png"
                width={80}
              />
            </span>
            <span className="text-base font-semibold tracking-tight">
              Where&apos;s Everyone?
            </span>
          </a>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">DEMO SPACE</Badge>
            <div
              aria-label="Yonna, Isha, and Agrima"
              className="flex -space-x-2"
              role="img"
            >
              {users.map((user, index) => (
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold ${
                    index % 2 === 0
                      ? "bg-pink-soft text-deep"
                      : "bg-availability-soft text-deep"
                  }`}
                  key={user.id}
                >
                  {user.name.slice(0, 1)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="mb-7 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pink-strong">
            A little time together goes a long way
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Find a time for whoever&apos;s in.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Keep your calendar personal, compare availability with any friends,
            and make a plan together.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.9fr)] xl:gap-6">
          <WeekCalendar
            onAddBusyBlock={(block) =>
              setPersonalBlocks((current) => [...current, block])
            }
            onImportBusyBlocks={(blocks) =>
              setPersonalBlocks((current) => [...current, ...blocks])
            }
            onViewChange={setCalendarView}
            personalBlocks={personalBlocks}
            view={calendarView}
          />

          <div className="flex min-w-0 flex-col gap-5 xl:gap-6">
            <Card>
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Propose a hangout</CardTitle>
                  {hangout && (
                    <Badge variant="secondary">Draft · v{hangout.version}</Badge>
                  )}
                </div>
                <CardDescription>
                  Choose who to invite. We&apos;ll find a time that works for this
                  group.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Invite friends
                  </legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {users.map((user, index) => {
                      const selected = inviteeIds.has(user.id);
                      return (
                        <button
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                            selected
                              ? "border-availability bg-availability-soft text-deep shadow-sm"
                              : "border-border bg-muted text-deep hover:border-pink hover:bg-pink-soft"
                          }`}
                          key={user.id}
                          onClick={() => toggleInvitee(user.id)}
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                              index % 2 === 0
                                ? "bg-pink-soft text-deep"
                                : "bg-muted text-deep"
                            }`}
                          >
                            {user.name.slice(0, 1)}
                          </span>
                          {user.name}
                          <span aria-hidden="true">
                            {selected ? "✓" : "+"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <button
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-action px-4 py-3 text-sm font-semibold text-primary-action-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink"
                  onClick={createHangout}
                  type="button"
                >
                  <SparkleMark />
                  Propose a hangout
                </button>
                {proposalError && (
                  <p className="mt-3 text-sm font-medium text-pink-strong" role="alert">
                    {proposalError}
                  </p>
                )}

                {hangout && (
                  <div
                    aria-live="polite"
                    className="mt-5 rounded-xl border border-availability bg-availability-soft p-4"
                    role="status"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-deep">
                      Proposed event
                    </p>
                    <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-deep">
                      {hangout.title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-deep">
                      {formatSlot(hangout.slot.start, hangout.slot.end)}
                    </p>
                    <p className="mt-1 text-sm text-deep">
                      {hangout.place}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-deep/80">
                      Invited:{" "}
                      {users
                        .filter((user) => hangout.attendees.includes(user.id))
                        .map((user) => user.name)
                        .join(", ")}
                    </p>
                    <p className="mt-2 border-t border-deep/15 pt-2 text-xs leading-5 text-deep/80">
                      {hangout.reasoning}
                    </p>
                    <div className="mt-3 border-t border-deep/15 pt-3">
                      <p className="text-xs font-semibold text-deep">
                        Assumptions to check
                      </p>
                      <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-5 text-deep/80">
                        {hangout.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {hangout && (
                  <>
                    <button
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary-action px-4 py-3 text-sm font-semibold text-primary-action-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={proposalSubmitted}
                      onClick={submitProposal}
                      type="button"
                    >
                      {proposalSubmitted ? "Proposal submitted" : "Submit proposal"}
                    </button>
                    {proposalSubmitted && (
                      <p className="mt-2 text-center text-xs text-muted-foreground" role="status">
                        Demo only — RSVP delivery is not connected yet.
                      </p>
                    )}
                  </>
                )}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {proposalSubmitted
                    ? "The proposal was marked as submitted in this demo."
                    : "No invitations are sent until you submit the proposal."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>What the agent believes</CardTitle>
                  <Badge variant="outline">{beliefs.length} beliefs</Badge>
                </div>
                <CardDescription>
                  Confidence is updated when new evidence arrives.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {beliefs.slice(0, 4).map((belief) => {
                    const subject = users.find(
                      (user) => user.id === belief.subjectUserId,
                    );
                    return (
                      <li className="py-3 first:pt-0 last:pb-0" key={belief.id}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <p className="text-sm leading-5">{belief.statement}</p>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-deep">
                            {subject?.name}
                          </span>
                        </div>
                        <ConfidenceBar confidence={belief.confidence} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-7 flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Calendar views use free/busy only; no recorded conflict isn&apos;t a
            guarantee.
          </span>
          <span>Times shown in Europe/London</span>
        </footer>
      </main>
    </div>
  );
}
