import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request, uploadFile, uuidv4 } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import { invalidateRefillData } from '@/features/refill/queries';
import type { DeliveryIncident } from '@/domain/types';

/**
 * Cups damaged on the way to a cart.
 *
 * The rider reports; Finance or an Administrator decides. This app only ever does the first half
 * — the decision is made in the CMS, and the rider learns the outcome through the notification
 * and through this list.
 */
export const incidentKeys = {
  mine: ['incidents'] as const,
};

/** The caller's own incidents: a rider's reports, or the ones on a staff member's deliveries. */
export function useIncidents(options?: { openOnly?: boolean }) {
  const openOnly = options?.openOnly ?? false;

  return useQuery({
    queryKey: [...incidentKeys.mine, { openOnly }] as const,
    queryFn: () => request<DeliveryIncident[]>(`/incidents${openOnly ? '?open=1' : ''}`),
  });
}

export type ReportIncidentInput = {
  refillId: number;
  /** Camera capture, required: this photo is the whole basis of the decision. */
  photoUri: string;
  takenAt: string;
  lines: { line_id: number; qty_damaged: number }[];
  note?: string;
};

/**
 * Files the report. One request with one file, so `uploadFile` carries it — see its docblock for
 * why this client streams multipart rather than using React Native's own FormData.
 *
 * The `uuid` is generated here and sent in the body as well as in the Idempotency-Key header: a
 * rider standing over a spilled crate on a bad connection will tap this twice, and one accident
 * must not become two reports (R14).
 */
export function useReportIncident() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportIncidentInput) => reportIncident(input),
    onSuccess: (_incident, input) => {
      void client.invalidateQueries({ queryKey: incidentKeys.mine });
      // The delivery itself is untouched for now — Finance decides what happens to it — but the
      // rider's list should reflect anything the server changed on the way.
      invalidateRefillData(client, input.refillId);
    },
  });
}

async function reportIncident(input: ReportIncidentInput): Promise<DeliveryIncident> {
  const compressed = await compressForUpload(input.photoUri);
  const uuid = uuidv4();

  return uploadFile<DeliveryIncident>(
    `/refills/${input.refillId}/incident`,
    { uri: compressed.uri, name: 'incident.jpg', type: 'image/jpeg' },
    {
      uuid,
      photo_taken_at: input.takenAt,
      // Multipart has no array-of-objects encoding this client can rely on, so the lines travel
      // as JSON — the same way they do on the delivery endpoint.
      lines: JSON.stringify(input.lines),
      ...(input.note ? { note: input.note } : {}),
    },
    // The endpoint names this part `photo`, not `file`.
    'photo',
    uuid,
  );
}
