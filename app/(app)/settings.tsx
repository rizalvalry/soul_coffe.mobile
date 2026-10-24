import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSettingsController } from '@/features/auth/useSettingsController';
import { Banner } from '@/components/ui/Banner';
import { accountRoleLabel, roleMeta } from '@/domain/roles';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * Settings, available to every role.
 *
 * Its only function today is the sign-in PIN, which is a genuine field-ergonomics fix rather than
 * a preference: staff sign in on a phone in one hand, outdoors, and a six-digit numeric keypad is
 * far quicker than a password on a phone keyboard. Everything about the PIN's weakness is handled
 * server-side — see LoginPinController and AuthController::loginWithPin — but three rules are
 * visible here because the user has to understand them before they commit:
 *
 *  - the account password is required to create, change or remove a PIN, because a token alone can
 *    be lifted from an unlocked phone;
 *  - the PIN REPLACES the password. Once it exists the password stops signing in, and the only way
 *    back from a forgotten PIN is an Administrator issuing a new password;
 *  - creating one ends every session on every device, so the user is signed out here and lands on
 *    the PIN pad immediately — they prove they can type it while they still remember it.
 *
 * The confirmation dialog states all three before anything is written. Saving a PIN a user did not
 * realise was replacing their password would lock them out of their own account, and no amount of
 * server-side correctness would make that acceptable.
 */
export default function SettingsScreen() {
  const {
    router, pin, setPin, confirmPin, setConfirmPin, password, setPassword, busy,
    error, notice, user, hasPin, save, confirmRemove,
  } = useSettingsController();

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
              {accountRoleLabel(user)}
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
                ? 'PIN aktif. Masuk memakai nomor HP dan PIN — kata sandi tidak lagi dipakai untuk masuk.'
                : 'Buat PIN 6 angka untuk masuk tanpa mengetik kata sandi.'}
            </Text>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="shield-key-outline" size={16} color={brand[700]} />
          <Text variant="caption" color={semantic.textMuted} style={styles.infoText}>
            PIN ini menggantikan kata sandi saat masuk, dan berbeda dari PIN serah-terima
            pengiriman. Kata sandi tetap diperlukan untuk mengubah atau menghapus PIN.
          </Text>
        </View>

        {/* Stated before the fields, not after the mistake: this is the consequence a user cannot
            reverse without an Administrator. */}
        <Banner
          tone="warning"
          icon="logout-variant"
          message="Menyimpan PIN akan mengeluarkan Anda dari semua perangkat. Anda langsung diminta masuk kembali dengan PIN baru."
        />

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
          onPress={save}
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
