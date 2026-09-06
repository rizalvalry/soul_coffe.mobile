import { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { AuthError, requestPinReset } from '@/features/auth/api';
import { normalisePhone } from '@/features/auth/schema';
import { brand, neutral, radius, semantic, space } from '@/theme';

type Props = {
  visible: boolean;
  /** Pre-filled from the device's sign-in hint, still editable. */
  initialPhone: string;
  onClose: () => void;
};

/**
 * "Lupa PIN" — the only way back into an account whose PIN has been forgotten.
 *
 * It collects the email the Administrator will reply to and the account password as the requester's
 * best available proof of identity. Neither unlocks anything by itself: the request goes into the
 * panel's queue, an Administrator decides, and they type the new password themselves.
 *
 * The success message is shown for EVERY accepted submission, including a phone number that does
 * not exist. That is the server's behaviour and it is copied here on purpose — telling an
 * unauthenticated caller "no such account" would turn this form into a directory of who works here.
 */
export function ForgotPinSheet({ visible, initialPhone, onClose }: Props) {
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = useCallback(() => {
    setEmail('');
    setPassword('');
    setError(null);
    setSent(false);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const submit = useCallback(async () => {
    setError(null);

    if (!phone.trim()) {
      setError('Nomor HP wajib diisi.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Masukkan alamat email yang valid — ke sinilah Administrator membalas.');
      return;
    }
    if (!password) {
      setError('Masukkan kata sandi akun Anda sebagai bukti identitas.');
      return;
    }

    setBusy(true);
    try {
      await requestPinReset(normalisePhone(phone), email.trim(), password);
      setSent(true);
      // Cleared immediately: the password has done its job and must not sit in state behind a
      // success screen the user may leave open on a bench.
      setPassword('');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Permintaan gagal dikirim. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }, [phone, email, password]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="lock-question" size={22} color={neutral[0]} />
              </View>
              <View style={styles.headerText}>
                <Text variant="h2">Lupa PIN</Text>
                <Text variant="caption" color={semantic.textMuted}>
                  Administrator akan membuatkan kata sandi baru untuk Anda.
                </Text>
              </View>
            </View>

            {sent ? (
              <>
                <Banner
                  tone="success"
                  message="Permintaan terkirim. Administrator akan membuat kata sandi baru dan mengirimkannya ke email yang Anda isi. Setelah menerimanya, masuk memakai kata sandi tersebut."
                />
                <Button label="TUTUP" icon="check" onPress={close} />
              </>
            ) : (
              <>
                <View style={styles.notice}>
                  <MaterialCommunityIcons
                    name="information-outline"
                    size={16}
                    color={brand[700]}
                  />
                  <Text variant="caption" color={semantic.textMuted} style={styles.noticeText}>
                    PIN tidak dapat dilihat atau dikirim ulang oleh siapa pun. Yang dilakukan
                    Administrator adalah membuat kata sandi baru, lalu PIN lama dihapus sehingga
                    Anda bisa masuk kembali dengan kata sandi itu.
                  </Text>
                </View>

                <Input
                  label="Nomor HP"
                  icon="phone-outline"
                  placeholder="08xxxxxxxxxx"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => {
                    setError(null);
                    setPhone(t);
                  }}
                  editable={!busy}
                />

                <Input
                  label="Alamat Email"
                  icon="email-outline"
                  placeholder="nama@perusahaan.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={(t) => {
                    setError(null);
                    setEmail(t);
                  }}
                  hint="Administrator mengirim kata sandi baru ke alamat ini."
                  editable={!busy}
                />

                <Input
                  label="Kata Sandi Akun"
                  icon="lock-outline"
                  placeholder="Kata sandi Anda"
                  secure
                  value={password}
                  onChangeText={(t) => {
                    setError(null);
                    setPassword(t);
                  }}
                  hint="Dipakai untuk memastikan permintaan ini benar dari Anda."
                  editable={!busy}
                  returnKeyType="send"
                  onSubmitEditing={() => void submit()}
                />

                {error ? <Banner tone="danger" message={error} /> : null}

                <Button
                  label="KIRIM KE ADMINISTRATOR"
                  icon="send"
                  onPress={() => void submit()}
                  loading={busy}
                  disabled={busy}
                />
                <Button label="Batal" variant="ghost" onPress={close} disabled={busy} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 33, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
  },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: brand[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: space.xxs },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: brand[50],
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { flex: 1 },
});
