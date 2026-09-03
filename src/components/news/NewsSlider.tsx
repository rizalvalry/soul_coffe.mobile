import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import { useNewsFeed } from '@/features/news/queries';
import { brand, neutral, radius, semantic, space } from '@/theme';
import type { NewsPost } from '@/domain/types';

const CARD_HEIGHT = 188;
const GAP = 12;

/** Falls back to the brand teal when a creator has not chosen an accent for the post. */
function accentOf(post: NewsPost): string {
  const value = post.accent_color?.trim();
  return value && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : brand[600];
}

/**
 * The highlighted-article carousel on the home screen.
 *
 * It renders nothing at all when there is no highlighted post — no skeleton, no "belum ada
 * berita" card. An empty slot on the home screen of an operations app is noise, and a permanent
 * empty state teaches people to scroll past that region forever, which is exactly what would kill
 * the feed the moment it does have something to say.
 *
 * The card scale/opacity is driven straight off the scroll offset through `Animated`, so the
 * neighbouring cards recede while the finger is still moving rather than snapping when it lifts.
 */
export function NewsSlider() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const feed = useNewsFeed(true);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const cardWidth = Math.round(width - space.lg * 2);
  const snap = cardWidth + GAP;

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(event.nativeEvent.contentOffset.x / snap));
    },
    [snap],
  );

  const posts = feed.data ?? [];
  if (posts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="flash-outline" size={18} color={brand[700]} />
          <Text variant="bodyStrong">Sorotan</Text>
        </View>
        <Pressable
          onPress={() => router.push('/news')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Lihat semua artikel"
        >
          <Text variant="caption" color={brand[700]}>
            Lihat semua
          </Text>
        </Pressable>
      </View>

      <Animated.FlatList
        data={posts}
        keyExtractor={(item: NewsPost) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snap}
        snapToAlignment="start"
        contentContainerStyle={styles.track}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        renderItem={({ item, index: i }: { item: NewsPost; index: number }) => {
          const range = [(i - 1) * snap, i * snap, (i + 1) * snap];
          const scale = scrollX.interpolate({
            inputRange: range,
            outputRange: [0.94, 1, 0.94],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange: range,
            outputRange: [0.65, 1, 0.65],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View style={{ width: cardWidth, transform: [{ scale }], opacity }}>
              <NewsCard post={item} onPress={() => router.push(`/news/${item.id}`)} />
            </Animated.View>
          );
        }}
      />

      {posts.length > 1 ? (
        <View style={styles.dots}>
          {posts.map((post, i) => (
            <View key={post.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NewsCard({ post, onPress }: { post: NewsPost; onPress: () => void }) {
  const accent = accentOf(post);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={post.title}
      accessibilityHint={post.excerpt ?? undefined}
      style={({ pressed }) => [styles.card, { backgroundColor: accent }, pressed && styles.pressed]}
    >
      {post.cover_url ? (
        <Image source={{ uri: post.cover_url }} style={styles.cover} resizeMode="cover" />
      ) : null}

      {/* A flat wash rather than a gradient: the app ships no gradient library, and a solid scrim
          at this opacity keeps white text legible over any photograph a creator uploads. */}
      <View style={[styles.scrim, !post.cover_url && styles.scrimSolid]} />

      <View style={styles.cardBody}>
        {post.kicker ? (
          <View style={styles.kicker}>
            <Text variant="micro" color={accent}>
              {post.kicker.toUpperCase()}
            </Text>
          </View>
        ) : null}

        <Text variant="h3" color={neutral[0]} numberOfLines={2}>
          {post.title}
        </Text>

        {post.excerpt ? (
          <Text variant="caption" color={neutral[0]} numberOfLines={2} style={styles.excerpt}>
            {post.excerpt}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {post.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text variant="micro" color={neutral[0]}>
                #{tag}
              </Text>
            </View>
          ))}
          {post.is_read ? null : (
            <View style={styles.newBadge}>
              <Text variant="micro" color={accent}>
                BARU
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  track: { gap: GAP },

  card: {
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  pressed: { opacity: 0.9 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  scrimSolid: { backgroundColor: 'rgba(0,0,0,0.18)' },

  cardBody: { padding: space.md, gap: space.xs },
  kicker: {
    alignSelf: 'flex-start',
    backgroundColor: neutral[0],
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  excerpt: { opacity: 0.92 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xxs },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  newBadge: {
    backgroundColor: neutral[0],
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.border },
  dotActive: { width: 18, backgroundColor: brand[600] },
});
