// Presentation-only helpers for session identifiers. They derive a stable tint and two-character badge
// from the session ID so rows are easy to tell apart at a glance. No data is created or changed.
const TINTS = ['coral', 'amber', 'lime', 'sky'];

export function idTint(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export const idBadge = (id) => id.replace(/[^0-9a-z]/gi, '').slice(0, 2).toUpperCase() || '··';
