"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { londonDateTimeToUtc } from "@/lib/time";
import type { BusyBlock, User } from "@/lib/types";

export type CalendarView = "personal" | "availability";
type BusyBlockDraft = BusyBlock & { externalUid?: string };

type WeekCalendarProps = {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  personalBlocks: BusyBlock[];
  onAddBusyBlock: (block: BusyBlockDraft) => Promise<void>;
  onImportBusyBlocks: (blocks: BusyBlockDraft[]) => Promise<void>;
  users: User[];
  busyBlocks: BusyBlock[];
  personalUserId: string;
};

const timezone = "Europe/London";
const weekStart = new Date(Date.UTC(2026, 9, 19));
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const weekdays = new Intl.DateTimeFormat("en-GB", {
  timeZone: timezone,
  weekday: "short",
});
const dayNumber = new Intl.DateTimeFormat("en-GB", {
  timeZone: timezone,
  day: "numeric",
});
function localHourToUtc(date: Date, hour: number): Date {
  const localDate = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return londonDateTimeToUtc(localDate, `${String(hour).padStart(2, "0")}:00`);
}

function isBusyAt(
  date: Date,
  hour: number,
  blocks: BusyBlock[],
  userId?: string,
): boolean {
  const start = localHourToUtc(date, hour).getTime();
  const end = start + 60 * 60 * 1000;
  return blocks.some(
    (block) =>
      (!userId || block.userId === userId) &&
      Date.parse(block.start) < end &&
      Date.parse(block.end) > start,
  );
}

function freeCountAt(
  date: Date,
  hour: number,
  selectedUserIds: Set<string>,
  blocks: BusyBlock[],
): number {
  return [...selectedUserIds].filter(
    (userId) => !isBusyAt(date, hour, blocks, userId),
  ).length;
}

function availabilityStyle(free: number, selected: number): string {
  if (selected === 0) {
    return "border-border bg-muted text-muted-foreground";
  }
  if (free === selected) {
    return "border-availability bg-availability-soft text-deep";
  }
  if (free > 0) {
    return "border-pink bg-pink-soft text-deep";
  }
  return "border-border bg-calendar-none text-calendar-none-foreground";
}

function avatarStyle(index: number): string {
  return index % 2 === 0
    ? "bg-pink-soft text-deep"
    : "bg-availability-soft text-deep";
}

function parseIcsDateTime(value: string, tzid?: string): Date {
  if (tzid && tzid !== timezone) {
    throw new Error(
      `The calendar uses ${tzid}. Only UTC and Europe/London events are supported in this demo.`,
    );
  }

  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(
    value,
  );
  if (!match) {
    throw new Error("The calendar contains an unsupported date or time.");
  }

  const [, year, month, day, hoursValue, minutesValue, secondsValue, utc] =
    match;
  if (!hoursValue) {
    const date = `${year}-${month}-${day}`;
    return londonDateTimeToUtc(date, "00:00");
  }
  if (utc) {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hoursValue),
        Number(minutesValue),
        Number(secondsValue ?? 0),
      ),
    );
  }

  return londonDateTimeToUtc(
    `${year}-${month}-${day}`,
    `${hoursValue}:${minutesValue}`,
  );
}

function parseIcsBusyBlocks(contents: string, personalUserId: string): BusyBlockDraft[] {
  const unfolded = contents.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  if (events.length === 0) {
    throw new Error("No calendar events were found in that .ics file.");
  }

  return events.map((event, index) => {
    if (/^RRULE(?:;|:)/m.test(event)) {
      throw new Error(
        "Recurring events are not expanded in this demo. Import a calendar without recurring events.",
      );
    }
    const getDate = (property: "DTSTART" | "DTEND") => {
      const match = new RegExp(
        `^${property}(?:;([^:\\r\\n]+))?:(\\d{8}(?:T\\d{4}(?:\\d{2})?Z?)?)$`,
        "m",
      ).exec(event);
      if (!match) {
        throw new Error("An event is missing a supported start or end time.");
      }
      const parameters = match[1] ?? "";
      const tzid = /(?:^|;)TZID=([^;]+)/.exec(parameters)?.[1];
      return parseIcsDateTime(match[2], tzid);
    };

    const start = getDate("DTSTART");
    const end = getDate("DTEND");
    if (end.getTime() <= start.getTime()) {
      throw new Error("An event ends before it starts.");
    }

    return {
      id: `ics-${Date.now()}-${index}`,
      userId: personalUserId,
      start: start.toISOString(),
      end: end.toISOString(),
      externalUid: /^UID:(.+)$/m.exec(event)?.[1]?.trim(),
    };
  });
}

export function WeekCalendar({
  view,
  onViewChange,
  personalBlocks,
  onAddBusyBlock,
  onImportBusyBlocks,
  users,
  busyBlocks,
  personalUserId,
}: WeekCalendarProps) {
  const [selectedUserIds, setSelectedUserIds] = useState(
    () => new Set(users.map((user) => user.id)),
  );
  const [showBusyForm, setShowBusyForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedUsers = users.filter((user) => selectedUserIds.has(user.id));
  const displayedBlocks =
    view === "personal"
      ? [...busyBlocks, ...personalBlocks].filter(
          (block) => block.userId === personalUserId,
        )
      : [...busyBlocks, ...personalBlocks];
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedUserIds(new Set(users.map((user) => user.id)));
  }

  async function addBusyTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");
    setStatusMessage("");
    const formData = new FormData(form);
    const date = String(formData.get("date"));
    const startTime = String(formData.get("start"));
    const endTime = String(formData.get("end"));

    try {
      const start = londonDateTimeToUtc(date, startTime);
      let endDate = date;
      if (endTime <= startTime) {
        const nextDay = new Date(`${date}T12:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDate = [
          nextDay.getUTCFullYear(),
          String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
          String(nextDay.getUTCDate()).padStart(2, "0"),
        ].join("-");
      }
      const end = londonDateTimeToUtc(endDate, endTime);
      if (end <= start) {
        throw new Error("Busy time must end after it starts.");
      }

      await onAddBusyBlock({
        id: `manual-${Date.now()}`,
        userId: personalUserId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      setShowBusyForm(false);
      setStatusMessage("Personal busy time added.");
      form.reset();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not add busy time.",
      );
    }
  }

  async function importIcsFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormError("");
    setStatusMessage("");
    try {
      const blocks = parseIcsBusyBlocks(await file.text(), personalUserId);
      await onImportBusyBlocks(blocks);
      setStatusMessage(
        `Imported ${blocks.length} busy ${
          blocks.length === 1 ? "time" : "times"
        } to your calendar.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not import this file.",
      );
    } finally {
      event.target.value = "";
    }
  }

  const busyEventCount = displayedBlocks.filter((block) =>
    weekDays.some((date) =>
      hours.some((hour) => {
        const slotStart = localHourToUtc(date, hour).getTime();
        return (
          Date.parse(block.start) < slotStart + 60 * 60 * 1000 &&
          Date.parse(block.end) > slotStart
        );
      }),
    ),
  ).length;

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>
              {view === "personal" ? "Your calendar" : "Group availability"}
            </CardTitle>
            <CardDescription>
              All 24 hours, Monday–Sunday · 19–25 October
            </CardDescription>
          </div>
          <Badge variant="outline">UK time · Europe/London</Badge>
        </div>

        <div
          aria-label="Calendar view"
          className="grid grid-cols-2 gap-1 rounded-xl bg-calendar-switch p-1"
          role="group"
        >
          <button
            aria-pressed={view === "personal"}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              view === "personal"
                ? "bg-pink-soft text-deep shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-deep"
            }`}
            onClick={() => onViewChange("personal")}
            type="button"
          >
            Your calendar
          </button>
          <button
            aria-pressed={view === "availability"}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              view === "availability"
                ? "bg-availability-soft text-deep shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-deep"
            }`}
            onClick={() => onViewChange("availability")}
            type="button"
          >
            Group availability
          </button>
        </div>

        {view === "personal" ? (
          <div className="space-y-4 rounded-xl border border-pink/50 bg-personal-wash p-4">
            <div>
              <p className="text-sm font-semibold text-deep">Yonna&apos;s busy times</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Private to your calendar. Only free/busy is shared with the group.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                accept=".ics,text/calendar"
                className="sr-only"
                onChange={importIcsFile}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="rounded-lg border border-pink bg-card px-3 py-2 text-sm font-semibold text-deep transition-colors hover:bg-pink-soft"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Import from .ics
              </button>
              <span className="self-center text-xs text-muted-foreground">
                Timed or all-day events · UTC / Europe/London · no recurring events
              </span>
              <button
                aria-expanded={showBusyForm}
                className="rounded-lg bg-primary-action px-3 py-2 text-sm font-semibold text-primary-action-foreground transition-opacity hover:opacity-90"
                onClick={() => {
                  setShowBusyForm((visible) => !visible);
                  setFormError("");
                }}
                type="button"
              >
                Add busy time
              </button>
            </div>

            {showBusyForm && (
              <form
                className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-3"
                onSubmit={addBusyTime}
              >
                <label className="grid gap-1.5 text-xs font-medium text-deep">
                  Date
                  <input
                    className="min-w-0 rounded-md border border-border bg-input px-2.5 py-2 text-sm text-foreground"
                    defaultValue="2026-10-19"
                    name="date"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-deep">
                  Starts
                  <input
                    className="min-w-0 rounded-md border border-border bg-input px-2.5 py-2 text-sm text-foreground"
                    defaultValue="17:00"
                    name="start"
                    required
                    type="time"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-deep">
                  Ends
                  <input
                    className="min-w-0 rounded-md border border-border bg-input px-2.5 py-2 text-sm text-foreground"
                    defaultValue="18:00"
                    name="end"
                    required
                    type="time"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                  <button
                    className="rounded-lg bg-availability-soft px-3 py-2 text-sm font-semibold text-deep transition-colors hover:brightness-95"
                    type="submit"
                  >
                    Save busy time
                  </button>
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                    onClick={() => setShowBusyForm(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Entered in Europe/London time. End before start means next day.
                  </span>
                </div>
              </form>
            )}

            {formError && (
              <p className="text-sm font-medium text-pink-strong" role="alert">
                {formError}
              </p>
            )}
            {statusMessage && (
              <p className="text-sm font-medium text-deep" role="status">
                {statusMessage}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {busyEventCount} busy{" "}
              {busyEventCount === 1 ? "block" : "blocks"} touch this week.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Compare availability</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Select any friends to see when they&apos;re free together.
                </p>
              </div>
              <button
                className="w-fit text-xs font-semibold text-deep underline decoration-deep/40 underline-offset-4 transition-colors hover:text-pink-strong"
                onClick={selectAll}
                type="button"
              >
                Select everyone
              </button>
            </div>

            <div className="flex flex-wrap gap-2" aria-label="Friends to compare">
              {users.map((user, index) => {
                const selected = selectedUserIds.has(user.id);
                return (
                  <button
                    aria-checked={selected}
                    aria-label={`Compare ${user.name}'s availability`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? "border-pink bg-pink-soft text-deep"
                        : "border-border bg-muted text-deep hover:border-availability hover:bg-availability-soft"
                    }`}
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    role="checkbox"
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${avatarStyle(index)}`}
                    >
                      {user.name.slice(0, 1)}
                    </span>
                    {user.name}
                    <span aria-hidden="true" className="text-xs">
                      {selected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {selectedUsers.length === 0
                ? "Choose one or more friends to compare."
                : `${selectedUsers.length} ${
                    selectedUsers.length === 1 ? "friend" : "friends"
                  } selected · numbers show how many are free`}
            </p>
          </>
        )}
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border bg-calendar-grid">
          <table className="w-full min-w-[760px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th
                  className="sticky left-0 z-20 w-16 bg-card px-2 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  scope="col"
                >
                  Time
                </th>
                {weekDays.map((date) => (
                  <th
                    className="min-w-[78px] px-1 py-2 font-normal"
                    key={date.toISOString()}
                    scope="col"
                  >
                    <span className="block text-[10px] font-medium uppercase text-muted-foreground">
                      {weekdays.format(date)}
                    </span>
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-deep">
                      {dayNumber.format(date)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => (
                <tr
                  className="border-b border-border/70 last:border-0"
                  key={hour}
                >
                  <th
                    className="sticky left-0 z-[1] bg-card px-2 text-left text-[10px] font-normal tabular-nums text-muted-foreground"
                    scope="row"
                  >
                    {`${String(hour).padStart(2, "0")}:00`}
                  </th>
                  {weekDays.map((date) => {
                    const isPersonal = view === "personal";
                    const busy = isPersonal
                      ? isBusyAt(date, hour, displayedBlocks, personalUserId)
                      : false;
                    const free = freeCountAt(
                      date,
                      hour,
                      selectedUserIds,
                      displayedBlocks,
                    );
                    const denominator = selectedUsers.length;
                    const conflictNames = selectedUsers
                      .filter((user) =>
                        isBusyAt(date, hour, displayedBlocks, user.id),
                      )
                      .map((user) => user.name);

                    return (
                      <td
                        className="px-1 py-0.5"
                        key={`${date.toISOString()}-${hour}`}
                      >
                        <div
                          aria-label={`${weekdays.format(date)} ${dayNumber.format(date)} October at ${String(hour).padStart(2, "0")}:00: ${
                            isPersonal
                              ? busy
                                ? "busy"
                                : "no recorded busy time"
                              : denominator === 0
                                ? "no friends selected"
                                : `${free} of ${denominator} selected ${
                                    free === 1 ? "friend is" : "friends are"
                                  } free`
                          }`}
                          className={`flex h-7 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums transition-colors ${
                            isPersonal
                              ? busy
                                  ? "border-pink bg-pink text-pink-foreground"
                                : "border-border bg-card text-muted-foreground"
                              : availabilityStyle(free, denominator)
                          }`}
                          title={
                            isPersonal
                              ? busy
                                ? "Busy"
                                : "No recorded busy time"
                              : denominator === 0
                                ? "Select friends to compare availability"
                                : `${free} of ${denominator} selected friends free${
                                    conflictNames.length
                                      ? ` · busy: ${conflictNames.join(", ")}`
                                      : ""
                                  }`
                          }
                        >
                          {isPersonal
                            ? busy
                              ? "Busy"
                              : "—"
                            : denominator === 0
                              ? "—"
                              : `${free}/${denominator}`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {view === "personal"
              ? "Busy details stay on your calendar; only availability is shared."
              : "Each cell is a one-hour slot. Busy event details are private."}
          </span>
          <div
            aria-label={view === "personal" ? "Personal calendar legend" : "Availability legend"}
            className="flex items-center gap-2"
          >
            {view === "personal" ? (
              <>
                <span className="text-xs text-muted-foreground">Busy</span>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-sm border border-pink bg-pink"
                />
                <span className="ml-1 text-xs text-muted-foreground">No block</span>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-sm border border-border bg-card"
                />
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Everyone free</span>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-sm border border-availability bg-availability-soft"
                />
                <span className="ml-1 text-xs text-muted-foreground">Some free</span>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-sm border border-pink bg-pink-soft"
                />
                <span className="ml-1 text-xs text-muted-foreground">None</span>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-sm border border-border bg-calendar-none"
                />
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
