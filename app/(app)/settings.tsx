import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/store';
import { AuthError, removeLoginPin, setLoginPin } from '@/features/auth/api';
import { roleMeta } from '@/domain/roles';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * Settings, available to every role.
 *
 * Its only function today is the sign-in PIN, which is a genuine field-ergonomics fix rather than
 * a preference: staff sign in on a phone in one hand, outdoors, and a six-digit numeric keypad is
 * far quicker than a password on a phone keyboard. Everything about the PIN's weakness is handled
 * server-side — see LoginPinController and AuthController::loginWithPin — but two rules are
 * visible here because the user has to understand them:
 *
 *  - the account password is required to create or change a PIN, because a token alone can be
 *    lifted from an unlocked phone;
 *  - the PIN is an ADDITION, never a replacement. The password always still works, which is what
 *    makes the per-account PIN lockout safe to apply.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const pinAvailable = useAuth((s) => s.pinAvailable);
  const setPinAvailable = useAuth((s) => s.setPinAvailable);

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

  const save = useCallback(async () => {
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

    setBusy(true);
    try {
      await setLoginPin(session.token, pin, password);
      await setPinAvailable(true);
      reset();
      setNotice('PIN berhasil disimpan. Anda bisa masuk dengan PIN di halaman login.');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Gagal menyimpan PIN. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }, [pin, confirmPin, password, session, setPinAvailable, reset]);

  const confirmRemove = useCallback(() => {
    Alert.alert(
      'Hapus PIN?',
      'Anda tetap bisa masuk menggunakan nomor HP dan kata sandi.',
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
                await removeLoginPin(session.token);
                await setPinAvailable(false);
                reset();
                setNotice('PIN dihapus.');
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
  }, [session, setPinAvailable, reset]);

  if (!user) return null;

  const meta = roleMeta[user.role];

  return (
    <Screen>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
          disabled={busy}
        />
      </View>

      <Text variant="h2">Pengaturan</Text>

      <Card style={styles.card}>
        <View style={styles.identityRow}>
          <View style={styles.identityIcon}>
            <MaterialCommunityIcons name={meta.icon as never} size={22} color={neutral[0]} />
          </View>
          <View style={styles.identityText}>
            <Text variant="bodyStrong">{user.name}</Text>
            <Text variant="caption" color={semantic.textMuted}>
              {meta.label}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHead}>
          <MaterialCommunityIcons name="dialpad" size={20} color={brand[700]} />
          <View style={styles.sectionHeadText}>
            <Text variant="bodyStrong">PIN Masuk</Text>
            <Text variant="caption" color={semantic.textMuted}>
              {hasPin
                ? 'PIN aktif. Anda bisa masuk dengan nomor HP dan PIN.'
                : 'Buat PIN 6 angka agar bisa masuk tanpa mengetik kata sandi.'}
            </Text>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="shield-key-outline" size={16} color={brand[700]} />
          <Text variant="caption" color={semantic.textMuted} style={styles.infoText}>
            PIN adalah tambahan, bukan pengganti. Kata sandi Anda tetap berfungsi, dan PIN ini
            berbeda dari PIN serah-terima pengiriman.
          </Text>
        </View>

        <Input
          label={hasPin ? 'PIN Baru (6 angka)' : 'PIN (6 angka)'}
          icon="dialpad"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          secure
          placeholder="••••••"
          editable={!busy}
        />

        <Input
          label="Ulangi PIN"
          icon="dialpad"
          value={confirmPin}
          onChangeText={(t) => setConfirmPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          secure
          placeholder="••••••"
          editable={!busy}
        />

        <Input
          label="Kata Sandi Akun"
          icon="lock-outline"
          value={password}
          onChangeText={setPassword}
          secure
          placeholder="Masukkan kata sandi"
          hint="Diperlukan untuk memastikan hanya Anda yang dapat mengubah PIN."
          editable={!busy}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={16}
              color={feedback.dangerFg}
            />
            <Text variant="caption" color={feedback.dangerFg} style={styles.infoText}>
              {error}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View style={styles.successBanner}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={brand[700]} />
            <Text variant="caption" color={brand[700]} style={styles.infoText}>
              {notice}
            </Text>
          </View>
        ) : null}

        <Button
          label={hasPin ? 'SIMPAN PIN BARU' : 'BUAT PIN'}
          icon="content-save-outline"
          onPress={() => void save()}
          loading={busy}
          disabled={busy}
        />

        {hasPin ? (
          <Button
            label="Hapus PIN"
            icon="trash-can-outline"
            variant="ghost"
            onPress={confirmRemove}
            disabled={busy}
          />
        ) : null}
      </Card>

      <Text variant="micro" color={semantic.textSubtle} center>
        Soul Coffeemate v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  card: { gap: space.md },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  identityIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: space.xxs },

  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  sectionHeadText: { flex: 1, gap: space.xxs },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: brand[50],
    borderRadius: radius.md,
    padding: space.md,
  },
  infoText: { flex: 1 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: feedback.dangerBg,
    borderColor: feedback.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand[50],
    borderColor: brand[200],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
});
