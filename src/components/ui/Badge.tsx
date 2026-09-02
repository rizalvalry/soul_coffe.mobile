import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { neutral, radius, space, statusColor, type RefillStatus } from '@/theme';

/** Indonesian label for each state in the refill state machine (§6). */
export const statusLabel: Record<RefillStatus, string> = {
  SUBMITTED: 'Menunggu Approval Finance',
  APPROVED: 'Disetujui Finance',
  REJECTED: 'Ditolak',
  PREPARING: 'Sedang Disiapkan',
  READY_TO_PICK: 'Siap Diambil',
  PICKED_UP: 'Sedang Diantar',
  DELIVERED: 'Diterima Staff',
  CLOSED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  EXPIRED: 'Kedaluwarsa',
};

export function StatusBadge({ status }: { status: RefillStatus }) {
  const c = statusColor[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text variant="micro" color={c.fg}>
        {statusLabel[status].toUpperCase()}
      </Text>
    </View>
  );
}

/** Numeric counter for menu tiles. Caps at 99+ so the layout cannot be broken by a big number. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.count}>
      <Text variant="micro" color={neutral[0]}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
});
