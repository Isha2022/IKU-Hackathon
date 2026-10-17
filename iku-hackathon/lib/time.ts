const timeZone = "Europe/London";

export function londonDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetUtc;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value);
    const localAsUtc = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    );
    guess += targetUtc - localAsUtc;
  }

  const result = new Date(guess);
  const resultParts = formatter.formatToParts(result);
  const part = (type: string) =>
    Number(resultParts.find((item) => item.type === type)?.value);

  if (
    part("year") !== year ||
    part("month") !== month ||
    part("day") !== day ||
    part("hour") !== hour ||
    part("minute") !== minute
  ) {
    throw new Error("That local time does not exist in Europe/London.");
  }

  return result;
}
