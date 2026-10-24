import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zodResolver';

import { useAuth } from '@/features/auth/store';
import { loginSchema, normalisePhone, type LoginForm } from '@/features/auth/schema';
import type { Role } from '@/domain/roles';

type Mode = 'password' | 'pin';

export function useLoginController() {
  const router = useRouter();
  const { signIn, signInWithPin, signInAsDemo, submitting, error, clearError } = useAuth();
  const lastPhone = useAuth((s) => s.lastPhone);
  const pinAvailable = useAuth((s) => s.pinAvailable);
  // Opens on the PIN pad whenever this device last signed in with an account that has one. That
  // is the normal case for a returning user: the password would only be refused with 409.
  const [mode, setMode] = useState<Mode>(pinAvailable && lastPhone ? 'pin' : 'password');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  /**
   * The hint is read from disk during `restore()`, which can land AFTER this screen first paints.
   * Without this the returning user would see the password form for a frame and then have it
   * swapped underneath them — or, if they were quick, would type a password that cannot work.
   *
   * It only ever moves the screen TO the PIN pad on arrival; it must not yank someone back who
   * deliberately tapped "Masuk dengan Kata Sandi".
   */
  const switchedRef = useRef(false);
  useEffect(() => {
    if (switchedRef.current) return;
    if (pinAvailable && lastPhone) {
      switchedRef.current = true;
      setMode('pin');
    }
  }, [pinAvailable, lastPhone]);

  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: lastPhone ?? '', password: '' },
    mode: 'onBlur',
  });

  const onSubmit = useCallback(
    async (values: LoginForm) => {
      setDeviceNotice(null);
      setNotice(null);
      const outcome = await signIn({
        phone: normalisePhone(values.phone),
        password: values.password,
      });

      if (outcome.result === 'ok') {
        router.replace('/menu');
        return;
      }
      if (outcome.result === 'device-pending' || outcome.result === 'device-rejected' || outcome.result === 'device-update-required') {
        setDeviceNotice(outcome.message);
        return;
      }

      // The password was right, but this account signs in with its PIN now. Move them to the pad
      // rather than showing a red error for something they did nothing wrong in.
      if (outcome.result === 'pin-required') {
        setPin('');
        setPinError(null);
        setMode('pin');
        setNotice(outcome.message);
      }
    },
    [signIn, router],
  );

  const onPinSubmit = useCallback(async () => {
    setDeviceNotice(null);
    setPinError(null);
    setNotice(null);

    if (!lastPhone) {
      setPinError('Masuk sekali dengan kata sandi terlebih dahulu di perangkat ini.');
      return;
    }
    if (pin.length !== 6) {
      setPinError('PIN harus terdiri dari 6 angka.');
      return;
    }

    const outcome = await signInWithPin(lastPhone, pin);

    if (outcome.result === 'ok') {
      router.replace('/menu');
      return;
    }
    if (outcome.result === 'device-pending' || outcome.result === 'device-rejected' || outcome.result === 'device-update-required') {
      setDeviceNotice(outcome.message);
      return;
    }

    // The PIN is gone — an Administrator reset this account. Send them to the password form with
    // the reason, instead of letting them keep trying a PIN that no longer exists.
    if (outcome.result === 'pin-not-set') {
      setPin('');
      setMode('password');
      setNotice(outcome.message);
    }
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

  return {
    control, handleSubmit, formState, mode, setMode, pin, setPin, pinError, setPinError,
    notice, setNotice, deviceNotice, forgotOpen, setForgotOpen, lastPhone, submitting,
    error, clearError, switchedRef, onSubmit, onPinSubmit, onDemo, canUsePin,
  };
}
