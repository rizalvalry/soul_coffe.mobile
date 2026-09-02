import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { brand, feedback, radius, semantic, space } from '@/theme';

/**
 * Honest placeholder for destinations scheduled in Phases 1-8.
 *
 * It names the route and the requirement it implements, so a reviewer opening the app can see
 * exactly what is built and what is not. A silent 404 or a fake-looking empty screen would hide
 * that distinction.
 */
export default function ComingSoonScreen() {
  const router = useRouter();
  const { title, route, requirement } = useLocalSearchParams<{
    title?: string;
    route?: string;
    requirement?: string;
  }>();

  return (
    <Screen>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>

      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="hammer-wrench" size={32} color={brand[700]} />
        </View>

        <Text variant="h2" center>
          {title ?? 'Halaman ini'}
        </Text>
        <Text variant="body" color={semantic.textMuted} center>
          Belum dibangun. Layar ini sengaja menampilkan status sebenarnya, bukan tampilan kosong
          yang menyesatkan.
        </Text>

        <View style={styles.metaBlock}>
          {route ? (
            <View style={styles.metaRow}>
              <Text variant="micro" color={semantic.textSubtle}>
                RUTE
              </Text>
              <Text variant="caption">{route}</Text>
            </View>
          ) : null}
          {requirement ? (
            <View style={styles.metaRow}>
              <Text variant="micro" color={semantic.textSubtle}>
                ACUAN SPESIFIKASI
              </Text>
              <Text variant="caption">{requirement}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.note}>
          <MaterialCommunityIcons name="information-outline" size={16} color={feedback.infoFg} />
          <Text variant="caption" color={feedback.infoFg} style={styles.noteText}>
            Lihat docs/03-task-breakdown.md untuk fase dan urutan pengerjaannya.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  card: { gap: space.md, alignItems: 'stretch' },
  iconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBlock: {
    gap: space.sm,
    backgroundColor: semantic.surfaceSunken,
    borderRadius: radius.md,
    padding: space.md,
  },
  metaRow: { gap: space.xxs },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: feedback.infoBg,
    borderColor: feedback.infoBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  noteText: { flex: 1 },
});
