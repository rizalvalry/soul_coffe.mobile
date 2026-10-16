import { QueryClient } from '@tanstack/react-query';

/** Every authenticated identity gets a new cache instance. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0, // Writes are replayed by the offline outbox, not by blind retry.
      },
    },
  });
}

let current = createQueryClient();

export function getQueryClient(): QueryClient {
  return current;
}

export function resetQueryClient(): void {
  const previous = current;
  current = createQueryClient();
  previous.clear();
}
