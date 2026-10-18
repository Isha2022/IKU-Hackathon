"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
import type { Belief, BusyBlock, Proposal, User } from "@/lib/types";
import type { SuggestResponse } from "@/types/contracts";

type CreatedHangout = Proposal & { threadId: string; usedFallback: boolean };
type BusyBlockDraft = BusyBlock & { externalUid?: string };

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

function SparkleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
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
  const [calendarView, setCalendarView] =
    useState<CalendarView>("availability");
  const [users, setUsers] = useState<User[]>([]);
  const [storedBusyBlocks, setStoredBusyBlocks] = useState<BusyBlock[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [personalBlocks, setPersonalBlocks] = useState<BusyBlock[]>([]);
  const [inviteeIds, setInviteeIds] = useState(() => new Set<string>());
  const [hangout, setHangout] = useState<CreatedHangout | null>(null);
  const [baseBeliefs, setBaseBeliefs] = useState<SuggestResponse["evidence"]["beliefs"]>([]);
  const [agentBeliefs, setAgentBeliefs] = useState<SuggestResponse["evidence"]["beliefs"]>([]);
  const [proposalError, setProposalError] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const invitees = users.filter((user) => inviteeIds.has(user.id));

  useEffect(() => {
    let active = true;
    fetch("/api/agent/context")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load the group.");
        return data;
      })
      .then((data: { members: User[]; beliefs: Belief[]; busyBlocks: BusyBlock[] }) => {
        if (!active) return;
        setUsers(data.members);
        setStoredBusyBlocks(data.busyBlocks);
        setInviteeIds(new Set(data.members.slice(0, 2).map((member) => member.id)));
        const loadedBeliefs = data.beliefs.map((belief) => ({ ...belief, subjectUserId: belief.subjectUserId ?? "" }));
        setBaseBeliefs(loadedBeliefs);
        setAgentBeliefs(loadedBeliefs);
        setContextError("");
      })
      .catch((error: unknown) => {
        if (active) setContextError(error instanceof Error ? error.message : "Unable to load the group.");
      })
      .finally(() => { if (active) setContextLoading(false); });
    return () => { active = false; };
  }, []);

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
    setAgentBeliefs(baseBeliefs);
  }

  async function persistCalendarBlocks(blocks: BusyBlockDraft[], source: "manual" | "ics") {
    for (const block of blocks) {
      const response = await fetch("/api/calendar/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: block.userId, start: block.start, end: block.end, source, externalUid: block.externalUid }),
      });
      const result = await response.json() as { block?: BusyBlock; error?: string };
      if (!response.ok || !result.block) {
        throw new Error(result.error ?? "Could not save this calendar block.");
      }
      setPersonalBlocks((current) => [...current, result.block!]);
    }
  }

  async function createHangout() {
    setProposalError("");
    if (invitees.length === 0) {
      setProposalError("Choose at least one person to invite.");
      return;
    }

    setIsProposing(true);
    setHangout(null);
    try {
      const response = await fetch("/api/agent/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: invitees.map((user) => user.id),
          startIso: "2026-10-19T15:00:00Z",
          endIso: "2026-10-27T00:00:00Z",
          durationMinutes: 120,
        }),
      });
      const result = (await response.json()) as
        | SuggestResponse
        | { error?: string };
      if (!response.ok || !("proposal" in result)) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "The agent could not suggest a hangout.",
        );
      }
      setHangout({
        ...result.proposal,
        threadId: result.threadId,
        usedFallback: result.usedFallback,
      });
      setAgentBeliefs(result.evidence.beliefs);
    } catch (error) {
      setProposalError(
        error instanceof Error
          ? error.message
          : "The agent could not suggest a hangout.",
      );
    } finally {
      setIsProposing(false);
    }
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
            key={users.map((user) => user.id).join(",")}
            users={users}
            busyBlocks={storedBusyBlocks}
            personalUserId={users[0]?.id ?? ""}
            onAddBusyBlock={(block) => persistCalendarBlocks([block], "manual")}
            onImportBusyBlocks={(blocks) => persistCalendarBlocks(blocks, "ics")}
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
                    <Badge variant="secondary">
                      {hangout.usedFallback ? "Fallback saved" : "Saved"} · v
                      {hangout.version}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Choose who to invite. We&apos;ll find a time that works for
                  this group.
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
                          <span aria-hidden="true">{selected ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <button
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-action px-4 py-3 text-sm font-semibold text-primary-action-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink"
                  onClick={createHangout}
                  disabled={isProposing || contextLoading || users.length === 0}
                  type="button"
                >
                  <SparkleMark />
                  {isProposing ? "Asking the agent…" : "Propose a hangout"}
                </button>
                {contextLoading && <p className="mt-3 text-sm text-muted-foreground">Loading group data…</p>}
                {contextError && <p className="mt-3 text-sm font-medium text-pink-strong" role="alert">{contextError}</p>}
                {proposalError && (
                  <p
                    className="mt-3 text-sm font-medium text-pink-strong"
                    role="alert"
                  >
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
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    This proposal is saved to the group database. Invitation delivery is not connected yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>What the agent believes</CardTitle>
                  <Badge variant="outline">
                    {hangout
                      ? "Updated for this proposal"
                      : `${agentBeliefs.length} beliefs`}
                  </Badge>
                </div>
                <CardDescription>
                  {hangout
                    ? "Evidence-backed beliefs the agent considered for this proposal."
                    : "Seeded beliefs are the agent’s starting evidence."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {agentBeliefs.slice(0, 4).map((belief) => {
                    const subject = users.find(
                      (user) => user.id === belief.subjectUserId,
                    );
                    return (
                      <li className="py-3 first:pt-0 last:pb-0" key={belief.id}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <p className="text-sm leading-5">
                            {belief.statement}
                          </p>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-deep">
                            {subject?.name}
                          </span>
                        </div>
                        <ConfidenceBar confidence={belief.confidence} />
                        {belief.evidence && (
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            Evidence: {belief.evidence}
                          </p>
                        )}
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
