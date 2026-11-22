// Internal service-desk planning labels: never expose these as customer SLAs.
export type ServiceNextAction =
  | 'not_set' | 'review_brief' | 'clarify_requirements'
  | 'prepare_scope' | 'coordinate_team' | 'await_customer';

export type ServiceReviewBucket = 'unscheduled' | 'overdue' | 'due_today' | 'upcoming';

export const serviceNextActionLabels: Record<ServiceNextAction, string> = {
  not_set: 'Not planned',
  review_brief: 'Review submitted brief',
  clarify_requirements: 'Clarify requirements',
  prepare_scope: 'Prepare scope review',
  coordinate_team: 'Coordinate internal team',
  await_customer: 'Await customer input',
};

export const serviceReviewBucketLabels: Record<ServiceReviewBucket, string> = {
  unscheduled: 'Not scheduled',
  overdue: 'Past review date',
  due_today: 'Review today (UTC)',
  upcoming: 'Upcoming review (UTC)',
};

export const validInternalReviewDate = (date: string): boolean => {
  if (!date) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date &&
    date >= '2020-01-01' && date <= '2100-12-31';
};
