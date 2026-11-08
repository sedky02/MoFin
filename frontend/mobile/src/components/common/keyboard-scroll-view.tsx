import * as React from 'react';
import { cssInterop } from 'nativewind';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewProps } from 'react-native-keyboard-controller';

// NativeWind styles only the components it knows; this one comes from a library.
cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});

/** How far above the keyboard the focused field sits, so its label and a line of context stay visible. */
const FIELD_GAP = 32;

/**
 * A page's scroll view that keeps whatever field has focus above the keyboard: it scrolls the field
 * into view as the keyboard opens and as the user moves between fields.
 */
export function KeyboardScrollView({
  bottomOffset = FIELD_GAP,
  ...props
}: KeyboardAwareScrollViewProps & { className?: string; contentContainerClassName?: string }) {
  return <KeyboardAwareScrollView bottomOffset={bottomOffset} keyboardShouldPersistTaps="handled" {...props} />;
}
