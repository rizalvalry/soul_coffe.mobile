export type ClosingSync = { ready: boolean; hadPending: boolean };
export type ClosingGateResult = 'pending' | 'review' | 'refresh_failed' | 'ready';

/** A synced old sale changes ledger stock, so the Rider must see a fresh draft first. */
export async function closingSubmissionGate(
  sync: ClosingSync,
  refreshDraft: () => Promise<{ isSuccess: boolean; data?: unknown }>,
): Promise<ClosingGateResult> {
  if (!sync.ready) return 'pending';
  if (!sync.hadPending) return 'ready';
  const refreshed = await refreshDraft();
  return refreshed.isSuccess && refreshed.data ? 'review' : 'refresh_failed';
}
