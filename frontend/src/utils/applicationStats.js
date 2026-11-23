// Dashboard statistics computed from the user's real applications.
//
// Status categories (backend enum: Saved, Applied, Interviewing, Offer, Rejected):
//   Total        every application
//   In progress  Applied + Interviewing: submitted and still awaiting an outcome.
//                Saved (not yet applied) and Offer/Rejected (outcomes) are excluded.
//   Interviews   Interviewing
//   Offers       Offer
export const STAT_DEFINITIONS = {
  total: 'All applications you are tracking.',
  inProgress: 'Applied or Interviewing: submitted and still awaiting an outcome.',
  interviews: 'Applications currently in the Interviewing stage.',
  offers: 'Applications that reached the Offer stage.',
};

const IN_PROGRESS = new Set(['Applied', 'Interviewing']);

export function computeStats(applications) {
  const stats = { total: applications.length, inProgress: 0, interviews: 0, offers: 0 };
  for (const { status } of applications) {
    if (IN_PROGRESS.has(status)) stats.inProgress += 1;
    if (status === 'Interviewing') stats.interviews += 1;
    if (status === 'Offer') stats.offers += 1;
  }
  return stats;
}
