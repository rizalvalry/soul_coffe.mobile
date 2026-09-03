import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zodResolver';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Touchable } from '@/components/ui/Touchable';
import { Chip } from '@/components/ui/Badge';
import { Gradient, GradientBloom } from '@/components/ui/Gradient';
import { enter } from '@/components/ui/Motion';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { useAuth } from '@/features/auth/store';
import { useKeyboardInset, useKeyboardVisible } from '@/lib/keyboard';
import { loginSchema, normalisePhone, type LoginForm } from '@/features/auth/schema';
import { rolesByPriority, roleMeta, type Role } from '@/domain/roles';
import { brand, feedback, gradients, neutral, pressScale, radius, semantic, space, touch } from '@/theme';

/**
 * Where the sheet rests, as a fraction of screen height measured from the top.
 *
 * EXPANDED is the default because the form is the reason anyone opens this screen. COLLAPSED is
 * a quarter of the screen lower — deliberately less than half, so the sheet can never be dragged
 * far enough to hide its own submit button.
 */
const SHEET_EXPANDED = 0.2;
const SHEET_COLLAPSED = 0.45;

/** Past this much of the travel, the release snaps to the far stop rather than springing back. */
const SNAP_THRESHOLD = 0.4;

type Mode = 'password' | 'pin';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithPin, signInAsDemo, submitting, error, clearError } = useAuth();
  const lastPhone = useAuth((s) => s.lastPhone);
  const pinAvailable = useAuth((s) => s.pinAvailable);
  const keyboardVisible = useKeyboardVisible();
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>('password');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const expandedTop = Math.round(height * SHEET_EXPANDED);
  const collapsedTop = Math.round(height * SHEET_COLLAPSED);
  const travel = collapsedTop - expandedTop;

  // `useRef` rather than state: the sheet must follow the finger every frame, and re-rendering
  // the whole form on each move would make the drag stutter.
  const offset = useRef(new Animated.Value(0)).current;
  const settled = useRef(0);

  // Widens and darkens while the sheet is being handled, so the grab registers instantly even
  // before the sheet has visibly moved.
  const grabbed = useRef(new Animated.Value(0)).current;

  const setGrabbed = useCallback(
    (on: boolean) => {
      Animated.timing(grabbed, {
        toValue: on ? 1 : 0,
        duration: 140,
        useNativeDriver: false, // width is not a transform
      }).start();
    },
    [grabbed],
  );

  const snapTo = useCallback(
    (next: number) => {
      settled.current = next;
      // tension/friction rather than speed/bounciness: this lands with one soft settle instead of
      // the springy overshoot the old values gave, which read as the sheet bouncing loose.
      Animated.spring(offset, {
        toValue: next,
        useNativeDriver: true,
        tension: 62,
        friction: 11,
      }).start();
    },
    [offset],
  );

  /** Tapping the grab area is the whole gesture — no drag needed. */
  const toggleSheet = useCallback(() => {
    snapTo(settled.current > travel / 2 ? 0 : travel);
  }, [snapTo, travel]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 3px, not 8: the old threshold made the sheet feel dead for the first third of a
        // centimetre of movement, which is exactly what "had to be felt around for" describes.
        // Still a movement test rather than a touch test, so a tap continues to reach the
        // Pressable underneath instead of being swallowed by the responder.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => setGrabbed(true),
        onPanResponderMove: (_e, g) => {
          const next = Math.min(travel, Math.max(0, settled.current + g.dy));
          offset.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          setGrabbed(false);
          const next = Math.min(travel, Math.max(0, settled.current + g.dy));

          // A deliberate flick wins over position: releasing mid-travel while still moving fast
          // should finish the movement, not snap back to whichever stop happens to be nearer.
          if (g.vy > 0.35) return snapTo(travel);
          if (g.vy < -0.35) return snapTo(0);
          snapTo(next > travel * SNAP_THRESHOLD ? travel : 0);
        },
        onPanResponderTerminate: () => setGrabbed(false),
      }),
    [offset, snapTo, travel, setGrabbed],
  );

  const handleWidth = grabbed.interpolate({ inputRange: [0, 1], outputRange: [48, 72] });
  const handleOpacity = grabbed.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  // Typing always brings the sheet to its highest stop: a form the user has just focused must
  // never be left sitting behind the keyboard because they had dragged the sheet down earlier.
  useEffect(() => {
    if (keyboardVisible) snapTo(0);
  }, [keyboardVisible, snapTo]);

  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: lastPhone ?? '', password: '' },
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

  const onPinSubmit = useCallback(async () => {
    setPinError(null);
    if (!lastPhone) {
      setPinError('Masuk sekali dengan kata sandi terlebih dahulu di perangkat ini.');
      return;
    }
    if (pin.length !== 6) {
      setPinError('PIN harus terdiri dari 6 angka.');
      return;
    }
    const ok = await signInWithPin(lastPhone, pin);
    if (ok) router.replace('/menu');
  }, [lastPhone, pin, signInWithPin, router]);

  const onDemo = useCallback(
    async (role: Role) => {
      const ok = await signInAsDemo(role);
      if (ok) router.replace('/menu');
    },
    [signInAsDemo, router],
  );

  // The PIN shortcut is only offered when it can actually work: this device has signed in before
  // and that account had a PIN. Otherwise the button would be a dead end.
  const canUsePin = pinAvailable && !!lastPhone;

  return (
    <View style={styles.root}>
      {/* Brand backdrop. brand[700], not the logo's brand[500]: white text on #00A3AA is only
          3.08:1 and fails WCAG AA. See tokens.ts. Rendered as the same brand gradient the rest
          of the app now uses for its hero surfaces, so the login screen reads as the front door
          of the same app rather than a flat-colour splash bolted onto it. */}
      <View style={[styles.backdrop, { paddingTop: insets.top + space.xl }]}>
        <Gradient colors={gradients.brand} fill bands={22} />
        <GradientBloom size={240} style={styles.backdropBloom} />

        {/* The mark is brand teal with the cup as white negative space, so on a teal ground it
            would all but disappear. The white disc is what makes it legible — and being a
            circle, it reads as deliberate brand furniture rather than a frame around the image. */}
        <Reanimated.View entering={enter('scale')} style={styles.logoPlate}>
          <SoulLogo size={52} showWordmark={false} />
        </Reanimated.View>
        <Reanimated.View entering={enter('below', 1)}>
          <Text variant="h1" color={neutral[0]} style={styles.headline}>
            Masuk untuk mulai{'\n'}bertugas hari ini.
          </Text>
          <Text variant="caption" color={brand[100]}>
            Soul Coffeemate · Operasional Lapangan
          </Text>
        </Reanimated.View>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            top: expandedTop,
            // Sized to the screen rather than stretched past it. An over-tall sheet gives its
            // ScrollView more height than the content will ever need, and a ScrollView that is
            // taller than its content does not scroll at all — which would strand the lower
            // fields behind the keyboard no matter how much bottom padding was added. The extra
            // `travel` keeps the bottom edge off-screen while the sheet is dragged down, so no
            // gap opens beneath it.
            height: height - expandedTop + travel,
            transform: [{ translateY: offset }],
          },
        ]}
      >
        {/* The grab area is the handle AND the heading beneath it — roughly 110px tall rather
            than the 24px strip it used to be. A drag target you have to feel around for is not a
            target, and on this screen it was the first thing anyone touched. */}
        <View {...pan.panHandlers} style={styles.grabZone}>
          <Pressable
            onPress={toggleSheet}
            accessibilityRole="button"
            accessibilityLabel="Perbesar atau perkecil area masuk"
            hitSlop={12}
            style={styles.handleHit}
          >
            <Animated.View
              style={[styles.handle, { width: handleWidth, opacity: handleOpacity }]}
            />
          </Pressable>

          <View style={styles.intro}>
            <Text variant="h1" center>
              {mode === 'pin' ? 'Masuk dengan PIN' : 'Login'}
            </Text>
            <Text variant="caption" color={semantic.textMuted} center>
              {mode === 'pin'
                ? `Gunakan PIN 6 angka untuk ${lastPhone ?? 'akun ini'}`
                : 'Gunakan nomor HP yang terdaftar oleh Administrator'}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            // Under an edge-to-edge window the keyboard covers the sheet without shrinking it,
            // so the scroll extent has to be grown by hand or the lower fields cannot be
            // reached at all. See lib/keyboard.ts.
            { paddingBottom: insets.bottom + space['3xl'] + keyboardInset },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {mode === 'password' ? (
            <>
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
            </>
          ) : (
            <Input
              label="PIN (6 angka)"
              icon="dialpad"
              placeholder="••••••"
              value={pin}
              onChangeText={(t) => {
                clearError();
                setPinError(null);
                setPin(t.replace(/\D/g, '').slice(0, 6));
              }}
              keyboardType="number-pad"
              maxLength={6}
              secure
              editable={!submitting}
              returnKeyType="go"
              onSubmitEditing={() => void onPinSubmit()}
              error={pinError ?? undefined}
            />
          )}

          {error ? <Banner message={error} tone="danger" /> : null}

          {mode === 'password' ? (
            <Button
              label="MASUK"
              icon="login"
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              hint="Masuk ke aplikasi menggunakan nomor HP dan kata sandi"
            />
          ) : (
            <Button
              label="MASUK DENGAN PIN"
              icon="dialpad"
              onPress={() => void onPinSubmit()}
              loading={submitting}
            />
          )}

          {canUsePin ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text variant="caption" color={semantic.textSubtle}>
                  atau
                </Text>
                <View style={styles.dividerLine} />
              </View>

              <Touchable
                onPress={() => {
                  clearError();
                  setPinError(null);
                  setPin('');
                  setMode((m) => (m === 'pin' ? 'password' : 'pin'));
                }}
                disabled={submitting}
                scaleTo={pressScale.control}
                accessibilityRole="button"
                accessibilityLabel={
                  mode === 'pin' ? 'Masuk dengan kata sandi' : 'Masuk dengan PIN'
                }
                style={styles.altButton}
              >
                <MaterialCommunityIcons
                  name={mode === 'pin' ? 'form-textbox-password' : 'dialpad'}
                  size={20}
                  color={semantic.text}
                />
                <Text variant="bodyStrong">
                  {mode === 'pin' ? 'Masuk dengan Kata Sandi' : 'Masuk dengan PIN'}
                </Text>
              </Touchable>
            </>
          ) : null}

          <Text variant="caption" color={semantic.textSubtle} center>
            Lupa kata sandi atau PIN? Hubungi Administrator.
          </Text>

          {/* The five roles are informational: the SERVER decides the role from the credentials.
              A client-side role picker would be forgeable. Hidden while typing so it is not
              competing with the form for a shortened viewport. */}
          {keyboardVisible ? null : (
            <View style={styles.rolesBlock}>
              <View style={styles.roleChips}>
                {rolesByPriority.map((role) => (
                  <Chip
                    key={role}
                    tone="brand"
                    label={roleMeta[role].label}
                    icon={<MaterialCommunityIcons name={roleMeta[role].icon as never} size={13} color={brand[700]} />}
                  />
                ))}
              </View>
            </View>
          )}

          {/* DEV ONLY — stripped from release builds by the __DEV__ guard here and in api.ts. */}
          {__DEV__ ? (
            <View style={styles.demoCard}>
              <View style={styles.demoHeader}>
                <MaterialCommunityIcons
                  name="flask-outline"
                  size={16}
                  color={feedback.warningFg}
                />
                <Text variant="micro" color={feedback.warningFg}>
                  MODE DEMO — HANYA DEVELOPMENT
                </Text>
              </View>
              {rolesByPriority.map((role) => (
                <Touchable
                  key={role}
                  onPress={() => void onDemo(role)}
                  disabled={submitting}
                  scaleTo={pressScale.surface}
                  accessibilityRole="button"
                  accessibilityLabel={`Masuk sebagai ${roleMeta[role].label}`}
                  style={styles.demoRow}
                >
                  <MaterialCommunityIcons
                    name={roleMeta[role].icon as never}
                    size={18}
                    color={brand[700]}
                  />
                  <Text variant="caption">{roleMeta[role].label}</Text>
                </Touchable>
              ))}
            </View>
          ) : null}

          <Text variant="micro" color={semantic.textSubtle} center>
            v{Constants.expoConfig?.version ?? '1.0.0'} · {Platform.OS}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand[700] },

  backdrop: {
    paddingHorizontal: space.xl,
    gap: space.md,
    overflow: 'hidden',
  },
  backdropBloom: { top: -90, right: -70 },
  logoPlate: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { color: neutral[0], lineHeight: 34 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  // ~110px of grabbable surface. The handle alone was 24px, which is below the size of the
  // fingertip meant to find it.
  grabZone: {
    paddingTop: space.sm,
    paddingBottom: space.md,
    // Its own horizontal padding: the grab zone sits outside the ScrollView, so it does not
    // inherit the content padding and its heading would otherwise run to the screen edge.
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  // A generous hit box around a small visual handle: the bar stays discreet, the target does not.
  handleHit: { alignItems: 'center', paddingVertical: space.sm },
  handle: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: brand[400],
  },
  sheetContent: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.lg },

  intro: { gap: space.xxs },

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

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: semantic.border },

  altButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: touch.minTarget,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: neutral[50],
  },
  altButtonPressed: { opacity: 0.7 },

  rolesBlock: { gap: space.sm },
  roleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.xs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    backgroundColor: brand[50],
    borderColor: brand[200],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },

  demoCard: {
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: feedback.warningBorder,
    backgroundColor: '#FFFDF5',
    padding: space.md,
  },
  demoHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 36,
  },
});
