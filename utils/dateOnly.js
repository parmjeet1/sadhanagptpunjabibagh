// Turns a date sent by an app into the plain "YYYY-MM-DD" a DATE column accepts.
// Accepts: "2014-06-15", "2014-06-15T00:00:00.000Z" (what the server itself sends back for a DATE),
// any other ISO timestamp (read as an India date, so 2014-06-14T18:30:00Z is 15 June), or a Date object.
// Returns null for empty input and undefined for something that is not a real date.

const pad = (n) => String(n).padStart(2, "0");
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const isRealDate = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export const toDateOnly = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;

  let y;
  let m;
  let d;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const ist = new Date(value.getTime() + IST_OFFSET_MS);
    [y, m, d] = [ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate()];
  } else {
    const s = String(value).trim();
    const plain = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const midnightUtc = s.match(/^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.0+)?Z$/); // the server's own DATE -> JSON form
    if (plain || midnightUtc) {
      [y, m, d] = (plain || midnightUtc).slice(1, 4).map(Number);
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const t = new Date(s);
      if (Number.isNaN(t.getTime())) return undefined;
      const ist = new Date(t.getTime() + IST_OFFSET_MS);
      [y, m, d] = [ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate()];
    } else {
      return undefined;
    }
  }
  if (!isRealDate(y, m, d)) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
};
