import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/Badge';
import { Touchable } from '@/components/ui/Touchable';
import { enter, listTransition } from '@/components/ui/Motion';
import { brand, pressScale, productColor, radius, shadow, semantic, space, statusColor } from '@/theme';
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
  /** Position in its list. Drives the entrance stagger — pass the FlatList/map index. */
  index?: number;
};

/**
 * Shared summary row for every refill list (rider, barista, finance, runner).
 *
 * `total_cost` is rendered only when the server actually sent it. The field is absent from
 * BARISTA/RIDER/STAFF responses by design (R15), so `showCost` alone is not enough — both the
 * flag and the value must be present.
 *
 * The card now carries a layout transition: when a realtime event drops a request out of a
 * queue, the rows below glide up instead of teleporting, so the operator sees that something
 * left rather than wondering what moved under their thumb. `index` (optional, defaults to 0)
 * drives its entrance stagger — pass it from a `renderItem`/`.map` callback for a list that fills
 * in one row after another instead of all at once.
 */
export function RefillCard({ refill, onPress, showCost = false, index = 0 }: RefillCardProps) {
  const cost = showCost && typeof refill.total_cost === 'number' ? refill.total_cost : null;
  const cardStyle = [styles.card, { borderLeftColor: statusColor[refill.status].fg }];

  const body = (
    <>
      <View style={styles.top}>
        <View style={styles.codeBlock}>
          <Text variant="bodyStrong">{refill.code}</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {formatTime(refill.submitted_at)} · {refill.staff_name}
          </Text>
        </View>
        <StatusBadge status={refill.status} />
      </View>

      {refill.lines.length > 0 ? (
        <View style={styles.products}>
          {refill.lines.slice(0, 3).map((line) => {
            const tone = productColor[line.product_name as keyof typeof productColor] ?? { bg: brand[50], fg: brand[700] };
            return (
              <View key={line.id} style={[styles.productChip, { backgroundColor: tone.bg }]}>
                <Text variant="micro" color={tone.fg} numberOfLines={1}>
                  {line.product_name} · diminta {line.qty_requested}
                </Text>
              </View>
            );
          })}
          {refill.lines.length > 3 ? (
            <View style={styles.productChip}>
              <Text variant="micro" color={semantic.textMuted}>+{refill.lines.length - 3} produk</Text>
            </View>
          ) : null}
        </View>
      ) : null}

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
    </>
  );

  if (!onPress) {
    return (
      <Animated.View entering={enter('below', index)} layout={listTransition} style={cardStyle}>
        {body}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={enter('below', index)} layout={listTransition}>
      <Touchable
        onPress={onPress}
        scaleTo={pressScale.surface}
        accessibilityRole="button"
        accessibilityLabel={`Permintaan ${refill.code}, Coffee Bike ${refill.cart_code}`}
        style={cardStyle}
      >
        {body}
      </Touchable>
    </Animated.View>
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
    backgroundColor: semantic.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: semantic.border,
    ...shadow.card,
    padding: space.lg,
    gap: space.sm,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  codeBlock: { flex: 1, gap: space.xxs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '60%' },
  products: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  productChip: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, backgroundColor: semantic.surfaceSunken, paddingHorizontal: space.sm, paddingVertical: space.xs },
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
