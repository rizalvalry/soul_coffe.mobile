import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';
import type { NewsPost, NewsReaction } from '@/domain/types';

export const newsKeys = {
  feed: (highlighted: boolean) => ['news', { highlighted }] as const,
  post: (id: number) => ['news', id] as const,
};

/**
 * The feed. `highlighted` fetches only the slider posts, which is a separate cache entry rather
 * than a client-side filter of the full list: the home slider renders on every launch, and it
 * should not have to wait for — or pay for — forty articles to show three.
 */
export function useNewsFeed(highlighted = false) {
  return useQuery({
    queryKey: newsKeys.feed(highlighted),
    queryFn: () => request<NewsPost[]>(`/news${highlighted ? '?highlighted=1' : ''}`),
    staleTime: 2 * 60_000, // editorial content, not operational state
  });
}

export function useNewsPost(id: number) {
  return useQuery({
    queryKey: newsKeys.post(id),
    queryFn: () => request<NewsPost>(`/news/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

/**
 * Records that the reader opened the article.
 *
 * Deliberately silent: a read receipt is bookkeeping for the writer, not something the reader
 * asked for, so a failure here must never surface as an error over an article they are already
 * reading. It is retried on the next open instead.
 */
export function useMarkNewsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ is_read: boolean }>(`/news/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

type ReactResult = {
  my_reaction: NewsReaction | null;
  reaction_counts: Partial<Record<NewsReaction, number>>;
};

/**
 * Sets or clears the reader's reaction. Sending the reaction already stored clears it, so the
 * same tap toggles — the server owns that rule; the client only reports the tap.
 *
 * The cache is patched from the server's response rather than optimistically: a reaction count is
 * shared state, and guessing it means showing a number that is briefly wrong for everyone.
 */
export function useReactToNews() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reaction }: { id: number; reaction: NewsReaction }) =>
      request<ReactResult>(`/news/${id}/react`, { method: 'POST', body: { reaction } }),
    onSuccess: (result, { id }) => {
      const patch = (post: NewsPost): NewsPost =>
        post.id === id
          ? { ...post, my_reaction: result.my_reaction, reaction_counts: result.reaction_counts }
          : post;

      client.setQueryData<NewsPost[]>(newsKeys.feed(false), (posts) => posts?.map(patch));
      client.setQueryData<NewsPost[]>(newsKeys.feed(true), (posts) => posts?.map(patch));
      client.setQueryData<NewsPost>(newsKeys.post(id), (post) => (post ? patch(post) : post));
    },
  });
}
