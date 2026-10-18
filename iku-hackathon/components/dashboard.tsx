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
import type { Belief, BusyBlock, StoredProposal, StoredProposalInvitation, User } from "@/lib/types";
import type { ReplyResponse, SuggestResponse, SubmitInvitationResponse } from "@/types/contracts";

type CreatedHangout = StoredProposal & { usedFallback: boolean };
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
  const [groupInvitations, setGroupInvitations] = useState<StoredProposalInvitation[]>([]);
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyUserId, setReplyUserId] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyStatus, setReplyStatus] = useState("");
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

  useEffect(() => {
    let active = true;
    fetch("/api/agent/invitations")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load invitations.");
        return data as { invitations: StoredProposalInvitation[] };
      })
      .then((data) => { if (active) setGroupInvitations(data.invitations); })
      .catch(() => { if (active) setGroupInvitations([]); });
    return () => { active = false; };
  }, []);

  const senderUserId = users.find((user) => user.name === "You")?.id ?? users[0]?.id ?? "";
  const activeInvitationRecipients = hangout
    ? groupInvitations.filter((item) => item.proposal.id === hangout.id).map((item) => item.recipientUserId)
    : [];
  const invitationSent = activeInvitationRecipients.length > 0;
  const replyRecipients = invitationSent
    ? activeInvitationRecipients
    : hangout?.attendees.filter((id) => id !== senderUserId) ?? [];
  const selectedInvitation = hangout
    ? groupInvitations.find((item) => item.proposal.id === hangout.id && item.recipientUserId === replyUserId)
    : undefined;
  const hasResponded = Boolean(selectedInvitation?.response || hangout?.status === "confirmed");

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
    setReplyStatus("");
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
        usedFallback: result.usedFallback,
      });
      setReplyUserId(invitees.find((user) => user.id !== senderUserId)?.id ?? "");
      setReplyMessage("");
      setReplyStatus("");
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

  async function sendInvitation() {
    if (!hangout || !senderUserId) return;
    setProposalError("");
    setIsSendingInvitation(true);
    try {
      const response = await fetch("/api/agent/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: hangout.threadId,
          proposalVersion: hangout.version,
          senderUserId,
        }),
      });
      const result = await response.json() as SubmitInvitationResponse | { error?: string };
      if (!response.ok || !("invitations" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Unable to send the invitation.");
      }
      setGroupInvitations(result.invitations);
      setReplyStatus(`Invitation added to the in-app inbox for ${result.invitations.map((item) => item.recipientName).join(", ")}.`);
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "Unable to send the invitation.");
    } finally {
      setIsSendingInvitation(false);
    }
  }

  async function sendReply(responseType: "accepted" | "declined") {
    if (!hangout || !replyUserId) return;
    setProposalError("");
    setIsSendingReply(true);
    const message = responseType === "accepted"
      ? "I accept this invitation."
      : replyMessage.trim() || "I can't make this invitation.";
    try {
      const response = await fetch("/api/agent/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: hangout.threadId,
          proposalVersion: hangout.version,
          userId: replyUserId,
          response: responseType,
          message,
        }),
      });
      const result = await response.json() as ReplyResponse | { error?: string };
      if (!response.ok || !("proposal" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Unable to process the reply.");
      }
      setHangout({ ...result.proposal, usedFallback: result.usedFallback });
      setAgentBeliefs(result.evidence.beliefs);
      setReplyStatus(result.proposal.version > result.previousProposal.version
        ? `${result.explanation} Review the revised idea, then send it as a new invitation.`
        : result.explanation);
      setReplyMessage("");
      const invitationsResponse = await fetch("/api/agent/invitations");
      if (invitationsResponse.ok) {
        const data = await invitationsResponse.json() as { invitations: StoredProposalInvitation[] };
        setGroupInvitations(data.invitations);
      }
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "Unable to process the reply.");
    } finally {
      setIsSendingReply(false);
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
                      {hangout.status === "confirmed" ? "Confirmed" : invitationSent ? "Invitation sent" : hangout.usedFallback ? "Fallback saved" : "Saved"} · v{hangout.version}
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
                  <div className="mt-4 space-y-3">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Invitations appear in the group&apos;s in-app inbox. This does not send email or push notifications.
                    </p>
                    <button
                      className="flex w-full items-center justify-center rounded-xl border border-pink px-4 py-3 text-sm font-semibold text-deep transition-colors hover:bg-pink-soft disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingInvitation || invitationSent || replyRecipients.length === 0}
                      onClick={sendInvitation}
                      type="button"
                    >
                      {isSendingInvitation ? "Sending invitation…" : invitationSent ? "Invitation sent" : "Send invitation"}
                    </button>
                    {replyStatus && <p className="text-sm text-deep" role="status">{replyStatus}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {hangout && invitationSent && replyRecipients.length > 0 && !hasResponded && hangout.status === "proposed" && (
              <Card>
                <CardHeader>
                  <CardTitle>Reply to this invitation</CardTitle>
                  <CardDescription>
                    Accept, or decline and tell the agent what you would prefer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="block text-sm font-medium" htmlFor="reply-message">If declining, share an alternative idea (optional)</label>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    id="reply-message"
                    onChange={(event) => setReplyMessage(event.target.value)}
                    placeholder="I can’t make that time, but could we do brunch instead?"
                    value={replyMessage}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="rounded-xl bg-availability px-4 py-3 text-sm font-semibold text-deep transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingReply}
                      onClick={() => sendReply("accepted")}
                      type="button"
                    >
                      {isSendingReply ? "Sending…" : "Accept"}
                    </button>
                    <button
                      className="rounded-xl border border-pink px-4 py-3 text-sm font-semibold text-deep transition-colors hover:bg-pink-soft disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingReply}
                      onClick={() => sendReply("declined")}
                      type="button"
                    >
                      {isSendingReply ? "Sending…" : "Decline"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {groupInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Group invitations</CardTitle>
                  <CardDescription>Proposals sent to this group in the app.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {groupInvitations.map((invitation) => (
                      <li className="py-3 first:pt-0 last:pb-0" key={`${invitation.proposal.id}-${invitation.recipientUserId}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{invitation.proposal.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatSlot(invitation.proposal.slot.start, invitation.proposal.slot.end)} · for {invitation.recipientName}
                            </p>
                          </div>
                          {invitation.proposal.status === "proposed" && !invitation.response ? (
                            <button
                              className="shrink-0 rounded-lg border border-pink px-3 py-2 text-xs font-semibold text-deep hover:bg-pink-soft"
                              onClick={() => {
                                setHangout({ ...invitation.proposal, usedFallback: false });
                                setReplyUserId(invitation.recipientUserId);
                                setReplyMessage("");
                                setReplyStatus("");
                                setProposalError("");
                              }}
                              type="button"
                            >
                              Respond
                            </button>
                          ) : (
                            <Badge variant="secondary">
                              {invitation.proposal.status === "confirmed" ? "Confirmed" : invitation.response === "yes" ? "Accepted" : invitation.response === "no" ? "Declined" : "Awaiting reply"}
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

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
