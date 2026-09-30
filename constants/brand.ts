/**
 * Product identity. Every product in the Iverto family shares the Iverto mark,
 * the crimson accent and the glass design system — only these strings change.
 *
 * The wordmark is drawn as `lead` in ink followed by `accent` in crimson, the
 * same way the parent brand reads "Iverto" + ".ai". Leave `accent` empty for a
 * wordmark that is all ink.
 */
export const BRAND = {
  /** Full display name — launcher label, headers, copy. */
  name: 'Iverto Attendance',
  wordmark: { lead: 'Iverto', accent: 'Attend' },
  /** One short line under the wordmark on the sign-in / welcome lockup. */
  tagline: 'Face in. Day sorted.',
} as const;
