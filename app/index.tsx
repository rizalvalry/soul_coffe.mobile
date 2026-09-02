import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/store';
import { useOnboarding } from '@/features/onboarding/store';

/**
 * Entry gate.
 *
 * Renders nothing while state is still loading — the branded splash in `_layout.tsx` is painted
 * over the whole stack until then, so anything drawn here would only flash underneath it.
 */
export default function Index() {
  const status = useAuth((s) => s.status);
  const onboarding = useOnboarding((s) => s.status);

  if (status === 'restoring' || onboarding === 'loading') return null;

  // The tour comes before the login screen: it explains what the app is for, which is worth more
  // to someone opening it for the first time than a password prompt.
  if (onboarding === 'pending') return <Redirect href="/onboarding" />;

  return <Redirect href={status === 'authenticated' ? '/menu' : '/login'} />;
}
