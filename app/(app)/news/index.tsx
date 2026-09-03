import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useNewsFeed } from '@/features/news/queries';
import { brand, neutral, radius, shadow, semantic, space } from '@/theme';
import type { NewsPost } from '@/domain/types';

/** Tag filtering is client-side on purpose: the feed is capped at 40 posts, so a round trip to
 *  narrow an already-loaded list would only add latency to a chip tap. */
export default function NewsListScreen() {
  const router = useRouter();
  const feed = useNewsFeed();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const posts = feed.data ?? [];

  const tags = useMemo(() => {
    const seen = new Set<string>();
    for (const post of posts) for (const tag of post.tags) seen.add(tag);
    return [...seen].slice(0, 12);
  }, [posts]);

  const visible = activeTag ? posts.filter((p) => p.tags.includes(activeTag)) : posts;
  const unread = posts.filter((p) => !p.is_read).length;

  return (
    <Screen refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()}>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>

      <View>
        <Text variant="h2">News Feed</Text>
        <Text variant="caption" color={semantic.textMuted}>
          {unread > 0 ? `${unread} artikel belum dibaca` : 'Semua artikel sudah dibaca'}
        </Text>
      </View>

      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          <Pressable
            onPress={() => setActiveTag(null)}
            style={[styles.tagChip, activeTag === null && styles.tagChipActive]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan semua artikel"
          >
            <Text variant="micro" color={activeTag === null ? neutral[0] : brand[700]}>
              SEMUA
            </Text>
          </Pressable>
          {tags.map((tag) => {
            const active = activeTag === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => setActiveTag(active ? null : tag)}
                style={[styles.tagChip, active && styles.tagChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Saring artikel bertag ${tag}`}
              >
                <Text variant="micro" color={active ? neutral[0] : brand[700]}>
                  #{tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {feed.isLoading ? (
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat artikel...
          </Text>
        </Card>
      ) : feed.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState
            icon="alert-circle-outline"
            title="Gagal memuat artikel"
            subtitle="Periksa koneksi internet Anda."
          />
          <Button label="Coba Lagi" variant="secondary" onPress={() => void feed.refetch()} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="newspaper-variant-outline"
            title={activeTag ? 'Tidak ada artikel dengan tag ini' : 'Belum ada artikel'}
            subtitle={
              activeTag
                ? 'Coba pilih tag lain atau tampilkan semua.'
                : 'Tim konten belum menerbitkan apa pun untuk Anda.'
            }
          />
        </Card>
      ) : (
        visible.map((post) => <NewsRow key={post.id} post={post} onPress={() => router.push(`/news/${post.id}`)} />)
      )}
    </Screen>
  );
}

function NewsRow({ post, onPress }: { post: NewsPost; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={post.title}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.thumbWrap}>
        {post.cover_url ? (
          <Image source={{ uri: post.cover_url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumbFallback}>
            <MaterialCommunityIcons name="coffee-outline" size={24} color={brand[500]} />
          </View>
        )}
        {post.is_read ? null : <View style={styles.unreadDot} />}
      </View>

      <View style={styles.rowText}>
        {post.kicker ? (
          <Text variant="micro" color={brand[700]}>
            {post.kicker.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="bodyStrong" numberOfLines={2}>
          {post.title}
        </Text>
        {post.excerpt ? (
          <Text variant="caption" color={semantic.textMuted} numberOfLines={2}>
            {post.excerpt}
          </Text>
        ) : null}
      </View>

      <MaterialCommunityIcons name="chevron-right" size={22} color={semantic.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tagChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tagChipActive: { backgroundColor: brand[600], borderColor: brand[600] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    padding: space.sm,
    ...shadow.card,
  },
  rowPressed: { opacity: 0.75 },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: radius.md },
  thumbFallback: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: brand[600],
    borderWidth: 2,
    borderColor: neutral[0],
  },
  rowText: { flex: 1, gap: space.xxs },
});
