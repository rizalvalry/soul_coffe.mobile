import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { useOnboarding } from '@/features/onboarding/store';
import { brand, neutral, radius, semantic, space } from '@/theme';

type Slide = {
  key: string;
  icon: string;
  title: string;
  body: string;
};

/**
 * Shown once, on the first launch after install (see `features/onboarding/store.ts`).
 *
 * The content is deliberately about the WORKFLOW rather than the app's features: the people using
 * this have a paper process to unlearn, and the three things that actually change for them are
 * that the total is computed, that the photo must be live, and that every step is tracked.
 */
const SLIDES: Slide[] = [
  {
    key: 'request',
    icon: 'clipboard-text-outline',
    title: 'Request Refill Tanpa Kertas',
    body: 'Pilih produk dan jumlahnya, total cups dihitung otomatis. Tidak ada lagi salah hitung seperti di formulir kertas.',
  },
  {
    key: 'evidence',
    icon: 'camera-outline',
    title: 'Foto Bukti Langsung dari Kamera',
    body: 'Setiap request wajib disertai foto kondisi frozen gerobak yang diambil saat itu juga. Foto lama tidak bisa dipakai ulang.',
  },
  {
    key: 'tracking',
    icon: 'timeline-check-outline',
    title: 'Pantau Setiap Tahap',
    body: 'Dari pengajuan, persetujuan Finance, penyiapan Barista, sampai diantar Rider — statusnya terlihat langsung di aplikasi.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const complete = useOnboarding((s) => s.complete);
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const finish = useCallback(async () => {
    await complete();
    // `replace`, never `push`: the tour must not be reachable with the back gesture once done.
    router.replace('/');
  }, [complete, router]);

  const next = useCallback(() => {
    if (isLast) {
      void finish();
      return;
    }
    const target = index + 1;
    listRef.current?.scrollToOffset({ offset: target * width, animated: true });
    setIndex(target);
  }, [isLast, index, width, finish]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex((current) => (next === current ? current : next));
    },
    [width],
  );

  return (
    <View style={styles.root}>
      <View style={styles.brandRow}>
        <SoulLogo size={40} showWordmark={false} />
        <Pressable
          onPress={() => void finish()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Lewati perkenalan"
        >
          <Text variant="caption" color={semantic.textMuted}>
            Lewati
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconPlate}>
              <MaterialCommunityIcons name={item.icon as never} size={64} color={brand[600]} />
            </View>
            <Text variant="h1" center>
              {item.title}
            </Text>
            <Text color={semantic.textMuted} center>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityRole="tablist">
          {SLIDES.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Button
          label={isLast ? 'MULAI' : 'LANJUT'}
          icon={isLast ? 'check' : 'arrow-right'}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neutral[0] },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space['4xl'],
    paddingBottom: space.lg,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['2xl'],
    gap: space.lg,
  },
  iconPlate: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  footer: { padding: space.lg, gap: space.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: brand[200],
  },
  dotActive: { width: 24, backgroundColor: brand[600] },
});
