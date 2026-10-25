// The "average" shown for one activity in an analysis window, worked out from the day-by-day values.
// Same rules the student's own Analytics screen uses, so mentor and student see the same number:
//  - empty days (0 / "00:00:00") are not counted for time activities;
//  - time activities are averaged as a clock (so 11 PM and 1 AM average to 12 AM, not noon) and
//    returned like "5:30 AM"; 0 means "no entries";
//  - other activities: total divided by the number of days in the period.
export function timeToMinutesOfDay(v) {
  if (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(v))) return Number(v);
  if (typeof v !== "string") return 0;
  let s = v.toUpperCase().trim();
  const isPM = s.includes("PM");
  const isAM = s.includes("AM");
  s = s.replace("AM", "").replace("PM", "").trim();
  const parts = s.split(":").map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

export function computeAverageValue(activityType, dailyData) {
  const valid = (dailyData || []).filter((d) => {
    const v = d.count;
    if (typeof v === "string" && v.includes(":")) return v !== "00:00:00" && v !== "00:00";
    return Number(v) > 0;
  });
  if (valid.length === 0) return 0;

  if (activityType === "time") {
    let sumSin = 0;
    let sumCos = 0;
    valid.forEach((d) => {
      const angle = (timeToMinutesOfDay(d.count) / 1440) * 2 * Math.PI;
      sumSin += Math.sin(angle);
      sumCos += Math.cos(angle);
    });
    let avgAngle = Math.atan2(sumSin / valid.length, sumCos / valid.length);
    if (avgAngle < 0) avgAngle += 2 * Math.PI;
    const avgMins = Math.round((avgAngle / (2 * Math.PI)) * 1440) % 1440;
    let h = Math.floor(avgMins / 60);
    const m = avgMins % 60;
    const period = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${String(m).padStart(2, "0")} ${period}`;
  }

  const total = valid.reduce((sum, d) => sum + Number(d.count), 0);
  let avg = total / dailyData.length;
  if (avg % 1 !== 0) avg = parseFloat(avg.toFixed(2));
  return avg;
}
