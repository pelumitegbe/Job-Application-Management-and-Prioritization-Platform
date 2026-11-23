// State helpers for bulk application entry. Each row reuses the single-form
// validation (validateApplicationForm) and payload builder (toCreatePayload), so
// both paths follow exactly the same backend rules.

import { EMPTY_APPLICATION_FORM, validateApplicationForm } from './applicationForm';

export const INITIAL_BULK_ROWS = 3;
export const MAX_BULK_ROWS = 20;

// Row lifecycle: 'draft' -> 'submitting' -> 'created' | 'failed' ('failed' rows can be retried).
let nextKey = 1;
export function createRow() {
  return { key: nextKey++, values: { ...EMPTY_APPLICATION_FORM }, status: 'draft', errors: {}, error: '', application: null };
}

export function createInitialRows(count = INITIAL_BULK_ROWS) {
  return Array.from({ length: count }, createRow);
}

/** True if the user hasn't typed anything into the row (defaults don't count). */
export function isRowEmpty(values) {
  return (
    !values.company.trim() &&
    !values.position.trim() &&
    !values.location.trim() &&
    !values.jobUrl.trim() &&
    !values.notes.trim() &&
    !values.applicationDate &&
    !values.deadline &&
    !values.followUpDate &&
    values.status === EMPTY_APPLICATION_FORM.status &&
    values.interestLevel === EMPTY_APPLICATION_FORM.interestLevel
  );
}

/** Rows that still need to be sent (everything not already created). */
export const pendingRows = (rows) => rows.filter((row) => row.status !== 'created');

/**
 * Validates every pending row with the single-application rules.
 * Returns the rows with `errors` set, plus whether all of them are valid.
 * Nothing is dropped: empty rows are reported as invalid, not silently skipped.
 */
export function validateRows(rows) {
  let valid = true;
  const next = rows.map((row) => {
    if (row.status === 'created') return row;
    const errors = validateApplicationForm(row.values);
    if (Object.keys(errors).length) valid = false;
    return { ...row, errors, error: '' };
  });
  return { rows: next, valid };
}
