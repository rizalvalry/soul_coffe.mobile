import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/store';
import { AuthError, removeLoginPin, setLoginPin } from '@/features/auth/api';

export function useSettingsController() {
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const pinAvailable = useAuth((s) => s.pinAvailable);
  const setPinAvailable = useAuth((s) => s.setPinAvailable);
  const endRevokedSession = useAuth((s) => s.endRevokedSession);

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const user = session?.user;
  const hasPin = user?.hasLoginPin ?? pinAvailable;

  const reset = useCallback(() => {
    setPin('');
    setConfirmPin('');
    setPassword('');
  }, []);

  /**
   * Writes the PIN, then ends the session the server has already revoked.
   *
   * `endRevokedSession` rather than `signOut`: `POST /me/login-pin` deletes every token for this
   * account as part of the same request, so the revoke call `signOut` makes would only 401 against
   * a token that no longer exists. The push registration is left in place on purpose — the same
   * person is about to sign back in on this same phone.
   */
  const applyPin = useCallback(async () => {
    if (!session?.token) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await setLoginPin(session.token, pin, password);
      await setPinAvailable(true);
      reset();

      Alert.alert(
        'PIN aktif — silakan masuk kembali',
        'Semua sesi telah dikeluarkan. Masuk lagi sekarang menggunakan PIN yang baru Anda buat, ' +
          'supaya Anda yakin PIN-nya benar. Mulai sekarang kata sandi tidak lagi dipakai untuk masuk.',
        [
          {
            text: 'MASUK DENGAN PIN',
            onPress: () => {
              void (async () => {
                await endRevokedSession();
                // replace, not push: the settings screen belongs to a session that no longer
                // exists, and it must not be reachable with the back gesture.
                router.replace('/login');
              })();
            },
          },
        ],
        // No dismiss: the session is gone either way, so an app left sitting on this screen would
        // be showing a signed-in UI that every request would 401 against.
        { cancelable: false },
      );
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Gagal menyimpan PIN. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }, [pin, password, session, setPinAvailable, reset, endRevokedSession, router]);

  const save = useCallback(() => {
    setError(null);
    setNotice(null);

    if (pin.length !== 6) {
      setError('PIN harus terdiri dari 6 angka.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Konfirmasi PIN tidak sama.');
      return;
    }
    if (!password) {
      setError('Masukkan kata sandi akun Anda untuk menyimpan PIN.');
      return;
    }
    if (!session?.token) return;

    // Everything the PIN changes, said before it changes. The wording is deliberately blunt about
    // the password no longer working: that is the part a user cannot undo on their own.
    Alert.alert(
      hasPin ? 'Ganti PIN masuk?' : 'Buat PIN masuk?',
      'Setelah disimpan:\n\n' +
        '• Anda akan dikeluarkan dari aplikasi di semua perangkat.\n' +
        '• Masuk berikutnya memakai PIN ini, bukan kata sandi.\n' +
        '• Jika PIN lupa, hanya Administrator yang bisa memulihkan akses lewat menu "Lupa PIN".',
      [
        { text: 'Batal', style: 'cancel' },
        { text: hasPin ? 'Ganti PIN' : 'Buat PIN', onPress: () => void applyPin() },
      ],
    );
  }, [pin, confirmPin, password, session, hasPin, applyPin]);

  const confirmRemove = useCallback(() => {
    setError(null);
    setNotice(null);

    // The password field is shared with the create form, so the same box that authorises adding a
    // PIN authorises removing one. Asked for explicitly rather than silently reused.
    if (!password) {
      setError('Masukkan kata sandi akun Anda untuk menghapus PIN.');
      return;
    }

    Alert.alert(
      'Hapus PIN?',
      'Setelah dihapus, Anda masuk kembali menggunakan nomor HP dan kata sandi. Sesi yang sedang berjalan tidak terputus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!session?.token) return;
              setBusy(true);
              setError(null);
              setNotice(null);
              try {
                await removeLoginPin(session.token, password);
                await setPinAvailable(false);
                reset();
                setNotice('PIN dihapus. Masuk berikutnya memakai kata sandi.');
              } catch (e) {
                setError(e instanceof AuthError ? e.message : 'Gagal menghapus PIN. Coba lagi.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [session, password, setPinAvailable, reset]);

  return {
    router, pin, setPin, confirmPin, setConfirmPin, password, setPassword, busy,
    error, notice, user, hasPin, save, confirmRemove,
  };
}
