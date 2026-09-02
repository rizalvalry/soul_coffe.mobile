import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zodResolver';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { useAuth } from '@/features/auth/store';
import { loginSchema, normalisePhone, type LoginForm } from '@/features/auth/schema';
import { rolesByPriority, roleMeta, type Role } from '@/domain/roles';
import { brand, feedback, neutral, radius, semantic, space, touch } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInAsDemo, submitting, error, clearError } = useAuth();

  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
    mode: 'onBlur',
  });

  const onSubmit = useCallback(
    async (values: LoginForm) => {
      const ok = await signIn({
        phone: normalisePhone(values.phone),
        password: values.password,
      });
      if (ok) router.replace('/menu');
    },
    [signIn, router],
  );

  const onDemo = useCallback(
    async (role: Role) => {
      const ok = await signInAsDemo(role);
      if (ok) router.replace('/menu');
    },
    [signInAsDemo, router],
  );

  return (
    <Screen contentStyle={styles.content}>
      {/* Brand header. Background is brand[700], not the logo's brand[500]: white text on
          #00A3AA is only 3.08:1 and fails WCAG AA. See tokens.ts. */}
      <View style={styles.header}>
        <View style={styles.logoPlate}>
          <SoulLogo size={104} showWordmark={false} />
        </View>
        <Text variant="h1" color={neutral[0]} center style={styles.headerTitle}>
          SOUL COFFEEMATE
        </Text>
        <Text variant="caption" color={brand[100]} center>
          Aplikasi Operasional Lapangan
        </Text>
      </View>

      <Card style={styles.formCard}>
        <View style={styles.formIntro}>
          <Text variant="h2">Masuk</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Gunakan nomor HP yang terdaftar oleh Administrator
          </Text>
        </View>

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Nomor HP"
              icon="phone-outline"
              placeholder="08xxxxxxxxxx"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={value}
              onChangeText={(t) => {
                clearError();
                onChange(t);
              }}
              onBlur={onBlur}
              error={formState.errors.phone?.message}
              editable={!submitting}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Kata Sandi"
              icon="lock-outline"
              placeholder="Masukkan kata sandi"
              secure
              autoComplete="password"
              textContentType="password"
              value={value}
              onChangeText={(t) => {
                clearError();
                onChange(t);
              }}
              onBlur={onBlur}
              error={formState.errors.password?.message}
              editable={!submitting}
              returnKeyType="go"
              onSubmitEditing={handleSubmit(onSubmit)}
            />
          )}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={18}
              color={feedback.dangerFg}
            />
            <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label="MASUK"
          icon="login"
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          hint="Masuk ke aplikasi menggunakan nomor HP dan kata sandi"
        />

        <Text variant="caption" color={semantic.textSubtle} center>
          Lupa kata sandi? Hubungi Administrator.
        </Text>
      </Card>

      {/* The five roles are informational here on purpose: the SERVER decides the role from the
          credentials. A client-side role picker would be forgeable. See api.ts. */}
      <View style={styles.rolesBlock}>
        <Text variant="micro" color={semantic.textSubtle} center style={styles.rolesHeading}>
          5 ROLE DALAM SISTEM
        </Text>
        <View style={styles.roleChips}>
          {rolesByPriority.map((role) => (
            <View key={role} style={styles.roleChip}>
              <MaterialCommunityIcons
                name={roleMeta[role].icon as never}
                size={14}
                color={brand[700]}
              />
              <Text variant="micro" color={brand[700]}>
                {roleMeta[role].label}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" color={semantic.textSubtle} center>
          Role Anda ditentukan otomatis oleh sistem sesuai akun.
        </Text>
      </View>

      {/* DEV ONLY — stripped from release builds by the __DEV__ guard here and in api.ts. */}
      {__DEV__ ? (
        <Card style={styles.demoCard}>
          <View style={styles.demoHeader}>
            <MaterialCommunityIcons name="flask-outline" size={16} color={feedback.warningFg} />
            <Text variant="micro" color={feedback.warningFg}>
              MODE DEMO — HANYA DEVELOPMENT
            </Text>
          </View>
          <Text variant="caption" color={semantic.textMuted}>
            Masuk tanpa backend untuk meninjau tampilan setiap role.
          </Text>

          {rolesByPriority.map((role) => {
            const meta = roleMeta[role];
            return (
              <Pressable
                key={role}
                onPress={() => void onDemo(role)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={`Masuk sebagai ${meta.label}`}
                style={({ pressed }) => [styles.demoRow, pressed && styles.demoRowPressed]}
              >
                <View style={styles.demoIcon}>
                  <MaterialCommunityIcons
                    name={meta.icon as never}
                    size={20}
                    color={brand[700]}
                  />
                </View>
                <View style={styles.demoRowText}>
                  <Text variant="bodyStrong">
                    {meta.priority}. {meta.label}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted}>
                    {meta.description}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={semantic.textSubtle}
                />
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Text variant="micro" color={semantic.textSubtle} center>
        v{Constants.expoConfig?.version ?? '1.0.0'} · {Platform.OS}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, gap: 0 },

  header: {
    backgroundColor: brand[700],
    paddingTop: space['3xl'],
    paddingBottom: space['4xl'],
    paddingHorizontal: space.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    alignItems: 'center',
  },
  logoPlate: {
    backgroundColor: neutral[0],
    borderRadius: radius.xl,
    padding: space.md,
  },
  headerTitle: { letterSpacing: 2, marginTop: space.lg },

  formCard: {
    marginTop: -space['2xl'],
    marginHorizontal: space.lg,
    gap: space.lg,
  },
  formIntro: { gap: space.xxs },

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
  errorText: { flex: 1 },

  rolesBlock: {
    marginTop: space['2xl'],
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  rolesHeading: { letterSpacing: 1 },
  roleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: brand[50],
    borderColor: brand[200],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },

  demoCard: {
    margin: space.lg,
    gap: space.md,
    borderColor: feedback.warningBorder,
    backgroundColor: '#FFFDF5',
  },
  demoHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.minTarget,
    paddingVertical: space.sm,
  },
  demoRowPressed: { opacity: 0.6 },
  demoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoRowText: { flex: 1, gap: space.xxs },
});
