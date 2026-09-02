import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMarkNewsRead, useNewsPost, useReactToNews } from '@/features/news/queries';
import { NEWS_REACTIONS, type NewsReaction } from '@/domain/types';
import { brand, neutral, radius, semantic, space } from '@/theme';

const REACTION_META: Record<NewsReaction, { emoji: string; label: string }> = {
  api: { emoji: '🔥', label: 'Api' },
  mantap: { emoji: '👍', label: 'Mantap' },
  semangat: { emoji: '💪', label: 'Semangat' },
  bingung: { emoji: '🤔', label: 'Bingung' },
};

/**
 * Renders the article body inside a WebView.
 *
 * The body is rich HTML written in the CMS, and the brief was explicitly that the writer must not
 * be boxed in — so the client cannot assume a fixed subset of tags. The page is built from a
 * `srcDoc`-style string with no navigation allowed, so nothing in an author's markup can navigate
 * the app somewhere else.
 */
function articleHtml(body: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  body { margin: 0; padding: 0; font-family: -apple-system, Roboto, system-ui, sans-serif;
         font-size: 15px; line-height: 1.7; color: ${semantic.text}; background: transparent; }
  img, video, iframe { max-width: 100%; height: auto; border-radius: 10px; }
  a { color: ${brand[700]}; }
  h1, h2, h3 { line-height: 1.3; margin: 1.2em 0 .4em; }
  blockquote { margin: 1em 0; padding: .6em 1em; border-left: 3px solid ${brand[300]};
               background: ${brand[50]}; border-radius: 6px; }
  pre { overflow-x: auto; background: #F4F4F5; padding: .8em; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #E4E4E7; padding: 6px 8px; }
</style>
</head><body>${body}
<script>
  // Reports the rendered height so the WebView can be sized to its content — an article inside a
  // fixed-height box would trap the reader in a nested scroll.
  function report() {
    window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));
  }
  window.addEventListener('load', report);
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
  setTimeout(report, 250);
</script>
</body></html>`;
}

export default function NewsDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const { width } = useWindowDimensions();

  const postQuery = useNewsPost(postId);
  const markRead = useMarkNewsRead();
  const react = useReactToNews();

  const post = postQuery.data;

  // Fires once per opened article. `mutate`, not `mutateAsync`: a failed read receipt is the
  // writer's bookkeeping and must never interrupt someone who is already reading.
  useEffect(() => {
    if (post && !post.is_read) markRead.mutate(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  const html = useMemo(() => (post?.body ? articleHtml(post.body) : null), [post?.body]);

  if (postQuery.isLoading) {
    return (
      <Screen>
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat artikel...
          </Text>
        </Card>
      </Screen>
    );
  }

  if (postQuery.isError || !post) {
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
        <Card style={styles.stateCard}>
          <EmptyState
            icon="alert-circle-outline"
            title="Artikel tidak tersedia"
            subtitle="Mungkin sudah ditarik atau tidak ditujukan untuk role Anda."
          />
          <Button label="Kembali ke Feed" variant="secondary" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={postQuery.isRefetching} onRefresh={() => void postQuery.refetch()}>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>

      {post.cover_url ? (
        <Image source={{ uri: post.cover_url }} style={styles.hero} resizeMode="cover" />
      ) : null}

      <View style={styles.headBlock}>
        {post.kicker ? (
          <View style={styles.kicker}>
            <Text variant="micro" color={neutral[0]}>
              {post.kicker.toUpperCase()}
            </Text>
          </View>
        ) : null}

        <Text variant="h1">{post.title}</Text>

        <View style={styles.byline}>
          <MaterialCommunityIcons name="account-edit-outline" size={14} color={semantic.textSubtle} />
          <Text variant="caption" color={semantic.textSubtle}>
            {post.author_name ?? 'Tim Konten'}
            {post.published_at
              ? ` · ${new Date(post.published_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}`
              : ''}
          </Text>
        </View>

        {post.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {post.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text variant="micro" color={brand[700]}>
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {html ? <ArticleBody html={html} width={width - space.lg * 2} /> : null}

      <Card style={styles.reactCard}>
        <Text variant="bodyStrong">Gimana menurut kamu?</Text>
        <View style={styles.reactions}>
          {NEWS_REACTIONS.map((reaction) => {
            const meta = REACTION_META[reaction];
            const mine = post.my_reaction === reaction;
            const count = post.reaction_counts[reaction] ?? 0;

            return (
              <Pressable
                key={reaction}
                onPress={() => react.mutate({ id: post.id, reaction })}
                disabled={react.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Beri reaksi ${meta.label}`}
                accessibilityState={{ selected: mine }}
                style={({ pressed }) => [
                  styles.reaction,
                  mine && styles.reactionActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="body">{meta.emoji}</Text>
                <Text variant="micro" color={mine ? neutral[0] : semantic.textMuted}>
                  {count > 0 ? count : meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

/**
 * Sizes itself to the article so the reader scrolls one page, not a box inside a page.
 *
 * The height arrives from the page itself (see the script in `articleHtml`) because the content
 * is author-written and its height cannot be known in advance.
 */
function ArticleBody({ html, width }: { html: string; width: number }) {
  const [height, setHeight] = useState(160);

  return (
    <View style={{ width, height }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        // The article is rendered content, not a browser: nothing an author writes may take the
        // reader out of the app or load another page in place of the article.
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        onMessage={(event) => {
          const next = Number(event.nativeEvent.data);
          if (Number.isFinite(next) && next > 0) setHeight(Math.max(next, 120));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  hero: { width: '100%', height: 200, borderRadius: radius.lg },

  headBlock: { gap: space.sm },
  kicker: {
    alignSelf: 'flex-start',
    backgroundColor: brand[600],
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  byline: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },

  webview: { flex: 1, backgroundColor: 'transparent' },

  reactCard: { gap: space.md },
  reactions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: neutral[50],
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  reactionActive: { backgroundColor: brand[600], borderColor: brand[600] },
  pressed: { opacity: 0.7 },
});
