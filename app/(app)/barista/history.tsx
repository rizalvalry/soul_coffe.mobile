import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRefills, useStaffOnShift } from '@/features/refill/queries';
import { brand, feedback, radius, semantic, space } from '@/theme';

const TERMINAL_STATUSES = ['READY_TO_PICK', 'PICKED_UP', 'DELIVERED', 'CLOSED'] as const;

/**
 * Prepared-request history is a real, server-scoped query (§2.1 — kitchen-scoped for BARISTA).
 *
 * Daily-allocation history has no backing endpoint yet: the API contract (docs/04) only exposes
 * `GET /allocations/today`, `GET /allocations/{id}` and `GET /me/allocation/today` — there is no
 * kitchen-wide allocation list. Rather than inventing a fetch call outside the reviewed contract,
 * this screen shows today's allocation status per staff (from the same source the allocation
 * screen uses) and says plainly that older days aren't available yet — the same "show the real
 * status" convention as `coming-soon.tsx`, not a silent gap.
 */
export default function BaristaHistoryScreen() {
  const refillsQuery = useRefills([...TERMINAL_STATUSES]);
  const staffQuery = useStaffOnShift();

  const prepared = [...(refillsQuery.data ?? [])].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );

  const refreshing = refillsQuery.isRefetching || staffQuery.isRefetching;
  const refresh = () => {
    void refillsQuery.refetch();
    void staffQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text variant="h2">Riwayat</Text>

      <View style={styles.section}>
        <Text variant="micro" color={semantic.textSubtle} style={styles.sectionTitle}>
          RIWAYAT PENYIAPAN
        </Text>

        {refillsQuery.isLoading ? (
          <ActivityIndicator color={brand[700]} />
        ) : refillsQuery.isError ? (
          <Card style={styles.stateCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={feedback.dangerFg} />
            <Text variant="caption" color={semantic.textMuted} center>
              {(refillsQuery.error as Error).message}
            </Text>
            <Button label="Coba Lagi" onPress={() => void refillsQuery.refetch()} />
          </Card>
        ) : prepared.length === 0 ? (
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Belum ada permintaan yang selesai disiapkan.
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {prepared.map((r) => (
              // R15 — cost never shown to Barista.
              <RefillCard key={r.id} refill={r} showCost={false} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="micro" color={semantic.textSubtle} style={styles.sectionTitle}>
          ALOKASI HARI INI
        </Text>

        {staffQuery.isLoading ? (
          <ActivityIndicator color={brand[700]} />
        ) : staffQuery.isError ? (
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              {(staffQuery.error as Error).message}
            </Text>
            <Button label="Coba Lagi" onPress={() => void staffQuery.refetch()} />
          </Card>
        ) : (staffQuery.data ?? []).length === 0 ? (
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Tidak ada staff yang bertugas hari ini.
            </Text>
          </Card>
        ) : (
          <Card style={styles.card}>
            {(staffQuery.data ?? []).map((s) => (
              <View key={s.staff_id} style={styles.staffRow}>
                <View>
                  <Text variant="body">{s.staff_name}</Text>
                  <Text variant="caption" color={semantic.textMuted}>Gerobak {s.cart_code}</Text>
                </View>
                <Text
                  variant="micro"
                  color={s.has_allocation ? feedback.successFg : feedback.warningFg}
                >
                  {s.has_allocation ? 'SUDAH' : 'BELUM'}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <View style={styles.noteRow}>
          <MaterialCommunityIcons name="information-outline" size={15} color={feedback.infoFg} />
          <Text variant="caption" color={feedback.infoFg} style={styles.noteText}>
            Riwayat alokasi hari-hari sebelumnya belum tersedia — API saat ini hanya menyediakan
            status alokasi hari ini.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  sectionTitle: { letterSpacing: 1 },
  list: { gap: space.md },
  card: { gap: space.md },
  staffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateCard: { gap: space.sm, alignItems: 'center' },
  noteRow: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.infoBg, borderColor: feedback.infoBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  noteText: { flex: 1 },
});
