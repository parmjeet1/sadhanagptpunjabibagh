/**
 * Cleaning and checking of the marking-rule rows sent by the scheme editor
 * (used by saveMarkingSchemeBatch). Kept free of database code so it can be tested alone.
 *
 * Why this exists: a rule for a NEWLY added activity used to be stored with
 *  - a frequency taken from the activity's UNIT ("rounds", "min"...) instead of daily/weekly/monthly,
 *    which the database turned into an empty text, and
 *  - an empty threshold, which was stored as the operator text (">= ").
 * The marks code ignores such a rule, so the scheme silently fell back to the default scheme.
 */

const VALID_FREQUENCIES = ["daily", "weekly", "monthly"];

/** 'Daily' / 'weekly ' -> 'daily'; anything else (a unit such as 'rounds', empty) -> null. */
export const parseRuleFrequency = (badge) => {
  const f = String(badge ?? "").trim().toLowerCase();
  return VALID_FREQUENCIES.includes(f) ? f : null;
};

const OPERATOR_WORDS = {
  "Before": "<=",
  "After": ">=",
  "Exact Time": "=",
  "At Least": ">=",
  "Up To": "<=",
  "Yes": "=",
  "No": "=",
};

/**
 * Works out the operator and value that will be stored for one editor row
 * (same rules as before: an old-style "condition" text is split into operator and value).
 * @returns {{ operator: string, value: string }}
 */
export const buildRuleCondition = (row) => {
  const conditionStr = row.condition || "";
  let operator = row.operator;
  let value = row.value;

  if (!operator || value === undefined || value === null || value === "") {
    operator = "=";
    value = conditionStr;

    for (const [rule, op] of Object.entries(OPERATOR_WORDS)) {
      if (conditionStr.toLowerCase().startsWith(rule.toLowerCase())) {
        operator = op;
        value = conditionStr.substring(rule.length).trim();
        if (rule === "Yes" || rule === "No") value = rule;
        break;
      }
    }
  }

  // Remove non-numeric text such as "min" / "rounds" unless it is a time or a yes/no word.
  if (value && typeof value === "string" && !value.includes(":") &&
      !["yes", "no", "true", "false", "completed"].includes(value.toLowerCase())) {
    const match = value.match(/[\d.]+/);
    if (match) value = match[0];
  }

  // Standard 'Yes' / 'No' for yes/no activities.
  if (value !== undefined && value !== null) {
    const valStr = String(value).trim().toLowerCase();
    if (valStr === "true" || valStr === "yes") value = "Yes";
    if (valStr === "false" || valStr === "no") value = "No";
  }

  return { operator, value: String(value ?? "").trim() };
};

/** A stored value must be a plain number, time or word: never empty, never just an operator like ">= ". */
export const isCleanRuleValue = (value) => /^[A-Za-z0-9:. ]+$/.test(String(value ?? "")) && String(value).trim() !== "";

/**
 * Looks at every row of every activity BEFORE anything is saved.
 * @returns {string|null} a message for the counsellor, or null when everything is fine
 */
export const findInvalidRuleMessage = (activities) => {
  for (const activity of activities || []) {
    const rows = [];
    if (activity.subTables) {
      for (const sub of activity.subTables) if (sub.rows) rows.push(...sub.rows);
    } else if (activity.rows) {
      rows.push(...activity.rows);
    }
    for (const row of rows) {
      const { value } = buildRuleCondition(row);
      if (!isCleanRuleValue(value)) {
        const title = activity.title || activity.name || "an activity";
        return `Please enter the target value for "${title}" (the ${row.marks ?? ""} marks row) before saving.`;
      }
    }
  }
  return null;
};
