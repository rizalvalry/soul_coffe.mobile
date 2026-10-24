import { useState } from 'react';

import { useRefills } from '@/features/refill/queries';
import type { RefillRequest } from '@/domain/types';

export function useRunnerActiveController() {
  const refillsQuery = useRefills('PICKED_UP');
  const [deliverId, setDeliverId] = useState<number | null>(null);
  const [incidentId, setIncidentId] = useState<number | null>(null);

  const active = refillsQuery.data ?? [];
  const deliverRefill = active.find((r) => r.id === deliverId) ?? null;
  const incidentRefill = active.find((r) => r.id === incidentId) ?? null;

  const refresh = () => void refillsQuery.refetch();
  const openDelivery = (refill: RefillRequest) => setDeliverId(refill.id);
  const closeDelivery = () => setDeliverId(null);
  const openIncident = (refill: RefillRequest) => setIncidentId(refill.id);
  const closeIncident = () => setIncidentId(null);
  const hasInactiveProducts = (refill: RefillRequest) =>
    refill.lines.some((line) => line.is_operational === false);
  const deliveryDisabled = (refill: RefillRequest) => !refill.can.deliver || hasInactiveProducts(refill);
  const incidentDisabled = (refill: RefillRequest) => hasInactiveProducts(refill);

  return {
    refillsQuery, active, deliverRefill, incidentRefill, refresh,
    openDelivery, closeDelivery, openIncident, closeIncident,
    hasInactiveProducts, deliveryDisabled, incidentDisabled,
  };
}
