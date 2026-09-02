import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * Extra scroll room a screen needs so a focused field can be brought above the keyboard.
 *
 * Android is the reason this exists. `windowSoftInputMode="adjustResize"` used to shrink the
 * window when the keyboard opened, which gave a ScrollView the room to scroll a field into view
 * on its own. Under the edge-to-edge window that Expo now enables by default, the window is no
 * longer resized on recent Android: the keyboard simply covers the bottom of the layout, the
 * scroll extent never grows, and a field that sits under it cannot be reached or even tapped —
 * exactly what made the login password field unusable.
 *
 * Adding the keyboard's height as bottom padding restores that room. It is measured rather than
 * assumed, and returns 0 when the window DID resize, so devices where `adjustResize` still works
 * do not get the offset applied twice.
 */
/** True while the software keyboard is on screen, regardless of whether the window resized. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // iOS emits will* early enough to animate with the keyboard; Android only emits did*.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    // Captured before any keyboard is up, so it is the unresized height to compare against.
    const fullHeight = Dimensions.get('window').height;

    const show = Keyboard.addListener(showEvent, (event) => {
      const keyboardHeight = event.endCoordinates?.height ?? 0;
      if (keyboardHeight <= 0) {
        setInset(0);
        return;
      }

      // If the window shrank by roughly the keyboard height, the platform already made the room.
      const shrunkBy = fullHeight - Dimensions.get('window').height;
      const alreadyResized = shrunkBy > keyboardHeight * 0.5;

      setInset(alreadyResized ? 0 : keyboardHeight);
    });

    const hide = Keyboard.addListener(hideEvent, () => setInset(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
