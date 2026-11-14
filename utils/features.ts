/**
 * features.ts — features that are switched off for now, in one place.
 *
 * To bring a feature back, set its switch to true, run the checks, and open a
 * PR. Nothing else needs to change.
 */

/**
 * Clinical Assistant (header button and its panel). Switched off on
 * 14 Nov 2026 at the department's request: for the time being no ward data
 * goes to Google's AI, and the on-phone checks go with it.
 *
 * While false, the button is not shown and the assistant's code is never
 * downloaded. The server function (clinical-insights) is untouched; its
 * Google key is removed in production separately.
 */
export const CLINICAL_ASSISTANT_ENABLED = false;
