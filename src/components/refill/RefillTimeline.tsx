import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { statusLabel } from '@/components/ui/Badge';
import { neutral, radius, semantic, space, statusColor, type RefillStatus } from '@/theme';
import { formatTime } from './RefillCard';
import type { RefillRequest } from '@/domain/types';

type TimelineStep = {
  status: RefillStatus;
  actor: string | null;
  time: string | null;
};

/** Forward path of the §6 state machine — CANCELLED/REJECTED/EXPIRED branch off SUBMITTED. */
const FORWARD_ORDER: RefillStatus[] = [
  'SUBMITTED',
  'APPROVED',
  'PREPARING',
  'READY_TO_PICK',
  'PICKED_UP',
  'DELIVERED',
  'CLOSED',
];

const TERMINAL_EXITS: RefillStatus[] = ['REJECTED', 'CANCELLED', 'EXPIRED'];

/**
 * Builds the timeline from the fields `RefillRequest` actually carries (submitted_at,
 * decided_at, prepared_at, picked_up_at, delivered_at) rather than a `status_history[]` the
 * domain type does not declare — see docs/04 §Flow B for the field set this reads.
 */
function buildSteps(refill: RefillRequest): TimelineStep[] {
  if (TERMINAL_EXITS.includes(refill.status)) {
    return [
      { status: 'SUBMITTED', actor: refill.staff_name, time: refill.submitted_at },
      {
        status: refill.status,
        actor: refill.status === 'REJECTED' ? refill.finance_name : refill.staff_name,
        time: refill.status === 'REJECTED' ? refill.decided_at : null,
      },
    ];
  }

  const actorFor: Record<RefillStatus, string | null> = {
    SUBMITTED: refill.staff_name,
    APPROVED: refill.finance_name,
    PREPARING: refill.barista_name,
    READY_TO_PICK: refill.barista_name,
    PICKED_UP: refill.rider_name,
    DELIVERED: refill.staff_name,
    CLOSED: null,
    REJECTED: refill.finance_name,
    CANCELLED: refill.staff_name,
    EXPIRED: null,
  };
  const timeFor: Record<RefillStatus, string | null> = {
    SUBMITTED: refill.submitted_at,
    APPROVED: refill.decided_at,
    PREPARING: null,
    READY_TO_PICK: refill.prepared_at,
    PICKED_UP: refill.picked_up_at,
    DELIVERED: refill.delivered_at,
    CLOSED: null,
    REJECTED: refill.decided_at,
    CANCELLED: null,
    EXPIRED: null,
  };

  const currentIndex = FORWARD_ORDER.indexOf(refill.status);
  // An unrecognised status defensively renders only the first step rather than throwing.
  const reachedCount = currentIndex >= 0 ? currentIndex + 1 : 1;

  return FORWARD_ORDER.slice(0, reachedCount).map((status) => ({
    status,
    actor: actorFor[status],
    time: timeFor[status],
  }));
}

/**
 * Vertical timeline of the §6 state machine for one refill request, one row per reached status.
 * Colour and label come from the same tokens the `StatusBadge` uses so a status never renders
 * with a colour or wording that disagrees with the badge shown elsewhere on the same screen.
 */
export function RefillTimeline({ refill }: { refill: RefillRequest }) {
  const steps = buildSteps(refill);

  return (
    <View>
      {steps.map((step, index) => {
        const color = statusColor[step.status];
        const isLast = index === steps.length - 1;

        return (
          <View key={step.status} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: color.fg, borderColor: color.border }]} />
              {!isLast ? <View style={styles.line} /> : null}
            </View>

            <View style={[styles.content, !isLast && styles.contentSpacing]}>
              <Text variant="bodyStrong">{statusLabel[step.status]}</Text>
              <Text variant="caption" color={semantic.textMuted}>
                {step.actor ?? 'Sistem'} · {formatTime(step.time)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rail: { width: 24, alignItems: 'center' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    borderWidth: 2,
    marginTop: 2,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: neutral[200],
    marginTop: space.xxs,
    marginBottom: space.xxs,
  },
  content: { flex: 1, gap: space.xxs },
  contentSpacing: { paddingBottom: space.lg },
});
