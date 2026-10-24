import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request, uploadFile, uuidv4 } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import { invalidateRefillData } from '@/features/refill/queries';
import type { DeliveryIncident } from '@/domain/types';

/**
 * Cups damaged on the way to a cart.
 *
 * The runner reports; Finance or an Administrator decides. This app only ever does the first half
 * — the decision is made in the CMS, and the runner learns the outcome through the notification
 * and through this list.
 */
export const incidentKeys = {
  mine: ['incidents'] as const,
};

/** The caller's own incidents: a runner's reports, or the ones on a rider's deliveries. */
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

type IncidentAttempt = {
  uuid: string;
  photoUri: string;
  takenAt: string;
  lines: string;
  note?: string;
};

/**
 * Files the report. One request with one file, so `uploadFile` carries it — see its docblock for
 * why this client streams multipart rather than using React Native's own FormData.
 *
 * A failed upload keeps its UUID, multipart fields, and compressed photo for the next tap. A new
 * form has a new hook instance; changed input starts a new attempt (R14).
 */
export function useReportIncident() {
  const client = useQueryClient();
  const attemptRef = useRef<{ fingerprint: string; prepared: Promise<IncidentAttempt> } | null>(null);

  return useMutation({
    mutationFn: async (input: ReportIncidentInput) => {
      const fingerprint = JSON.stringify(input);
      let entry = attemptRef.current;
      if (!entry || entry.fingerprint !== fingerprint) {
        entry = { fingerprint, prepared: prepareIncidentAttempt(input) };
        attemptRef.current = entry;
      }

      let attempt: IncidentAttempt;
      try {
        attempt = await entry.prepared;
      } catch (error) {
        if (attemptRef.current === entry) attemptRef.current = null;
        throw error;
      }

      const result = await uploadFile<DeliveryIncident>(
        `/refills/${input.refillId}/incident`,
        { uri: attempt.photoUri, name: 'incident.jpg', type: 'image/jpeg' },
        {
          uuid: attempt.uuid,
          photo_taken_at: attempt.takenAt,
          // Multipart has no array-of-objects encoding this client can rely on, so the lines travel
          // as JSON — the same way they do on the delivery endpoint.
          lines: attempt.lines,
          ...(attempt.note ? { note: attempt.note } : {}),
        },
        // The endpoint names this part `photo`, not `file`.
        'photo',
        attempt.uuid,
      );
      if (attemptRef.current === entry) attemptRef.current = null;
      return result;
    },
    onSuccess: (_incident, input) => {
      void client.invalidateQueries({ queryKey: incidentKeys.mine });
      // The delivery itself is untouched for now — Finance decides what happens to it — but the
      // runner's list should reflect anything the server changed on the way.
      invalidateRefillData(client, input.refillId);
    },
  });
}

async function prepareIncidentAttempt(input: ReportIncidentInput): Promise<IncidentAttempt> {
  const uuid = uuidv4();
  const takenAt = input.takenAt;
  const lines = JSON.stringify(input.lines);
  const note = input.note;
  const compressed = await compressForUpload(input.photoUri);
  return { uuid, photoUri: compressed.uri, takenAt, lines, note };
}
