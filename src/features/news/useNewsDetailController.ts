import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { useMarkNewsRead, useNewsPost, useReactToNews } from '@/features/news/queries';

export function useNewsDetailController() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const postQuery = useNewsPost(postId);
  const markRead = useMarkNewsRead();
  const react = useReactToNews();
  const post = postQuery.data;

  // A failed read receipt is bookkeeping and must not interrupt the article.
  useEffect(() => {
    if (post && !post.is_read) markRead.mutate(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  return { postQuery, react, post };
}
