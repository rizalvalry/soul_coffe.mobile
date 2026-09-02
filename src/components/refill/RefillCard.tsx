import { Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/Badge';
import { elevation, neutral, radius, semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export type RefillCardProps = {
  refill: RefillRequest;
  onPress?: () => void;
  /** Renders the total value row. Only pass true for FINANCE/ADMIN — see R15. */
  showCost?: boolean;
};

/**
 * Shared summary row for every refill list (staff, barista, finance, rider).
 *
 * `total_cost` is rendered only when the server actually sent it. The field is absent from
 * BARISTA/RIDER/STAFF responses by design (R15), so `showCost` alone is not enough — both the
 * flag and the value must be present.
 */
export function RefillCard({ refill, onPress, showCost = false }: RefillCardProps) {
  const cost = showCost && typeof refill.total_cost === 'number' ? refill.total_cost : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Permintaan ${refill.code}, gerobak ${refill.cart_code}`}
      style={({ pressed }) => [styles.card, pressed && onPress && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={styles.codeBlock}>
          <Text variant="bodyStrong">{refill.code}</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {formatTime(refill.submitted_at)} · {refill.staff_name}
          </Text>
        </View>
        <StatusBadge status={refill.status} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="moped-outline" size={15} color={semantic.textMuted} />
          <Text variant="caption" color={semantic.text}>
            {refill.cart_code}
          </Text>
        </View>

        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="cup-outline" size={15} color={semantic.textMuted} />
          <Text variant="caption" color={semantic.text}>
            {refill.total_requested} cups
          </Text>
        </View>

        {refill.location_name ? (
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="map-marker-outline" size={15} color={semantic.textMuted} />
            <Text variant="caption" color={semantic.text} numberOfLines={1}>
              {refill.location_name}
            </Text>
          </View>
        ) : null}
      </View>

      {cost !== null ? (
        <View style={styles.costRow}>
          <Text variant="caption" color={semantic.textMuted}>
            Nilai permintaan
          </Text>
          <Text variant="bodyStrong">{formatRupiah(cost)}</Text>
        </View>
      ) : null}

      {refill.gps_unavailable || refill.out_of_hours ? (
        <View style={styles.flagRow}>
          {refill.gps_unavailable ? <Flag icon="map-marker-off-outline" label="Tanpa GPS" /> : null}
          {refill.out_of_hours ? <Flag icon="clock-alert-outline" label="Di luar jam" /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function Flag({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.flag}>
      <MaterialCommunityIcons name={icon as never} size={12} color={semantic.textMuted} />
      <Text variant="micro" color={semantic.textMuted}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: space.lg,
    gap: space.sm,
    ...elevation.sm,
  },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  codeBlock: { flex: 1, gap: space.xxs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '60%' },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.sm,
  },
  flagRow: { flexDirection: 'row', gap: space.sm },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});
