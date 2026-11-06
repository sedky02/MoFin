import { usePhoneFrameOverlayStyle } from '@/components/shell/web-phone-frame';
import { Icon } from '@/components/ui/icon';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { SheetBottomInset, SheetHandle, useSheetDrag, useSheetKeyboard } from '@/components/ui/sheet-parts';
import { X } from '@/lib/icons';
import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import { Animated, Platform, StyleSheet, Text, View, type GestureResponderEvent, type ViewProps } from 'react-native';
import Reanimated, { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function DialogOverlay({
  className,
  children,
  onPress,
  sheet = false,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, 'asChild'> & {
  children?: React.ReactNode;
  /** Anchor the content to the bottom edge and slide it up (a bottom sheet) instead of centring it. */
  sheet?: boolean;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();
  const frameStyle = usePhoneFrameOverlayStyle();
  const { lift } = useSheetKeyboard();

  function onOverlayPress(event: GestureResponderEvent) {
    onPress?.(event);
    if (event.target === event.currentTarget && !event.isDefaultPrevented()) {
      onOpenChange(false);
    }
  }

  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 flex bg-black/50',
          sheet ? 'items-stretch justify-end p-0' : 'items-center justify-center p-2',
          Platform.select({
            web: 'animate-in fade-in-0 fixed cursor-default [&>*]:cursor-auto',
          }),
          className
        )}
        {...props}
        style={frameStyle}
        onPress={Platform.select({ web: onOverlayPress, native: onPress })}
        asChild={Platform.OS !== 'web'}>
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          as="Pressable">
          <NativeOnlyAnimatedView
            entering={(sheet ? SlideInDown.duration(260) : FadeIn.delay(50)).reduceMotion(ReduceMotion.System)}
            exiting={(sheet ? SlideOutDown.duration(200) : FadeOut.duration(150)).reduceMotion(ReduceMotion.System)}>
            {/* Rides up on the keyboard and back down when it closes (see useSheetKeyboard). */}
            <Reanimated.View style={[{ width: '100%' }, lift]}>{children}</Reanimated.View>
          </NativeOnlyAnimatedView>
        </NativeOnlyAnimatedView>
      </DialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

/**
 * A dialog's panel. On a phone every dialog is a bottom sheet by default: full width, rounded top,
 * slides up, a grab handle that closes it when pulled down, room for the home indicator, and a
 * height cap below the status bar. `sheet={false}` gives the centred card instead.
 */
function DialogContent({
  className,
  portalHost,
  sheet = true,
  style,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
  sheet?: boolean;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const drag = useSheetDrag(sheet ? close : undefined);
  // The sheet never reaches under the status bar, whatever cap the caller asked for, and shrinks to
  // the room above the keyboard: its body scrolls and the actions stay just above the keyboard.
  const { cap } = useSheetKeyboard(Number(StyleSheet.flatten(style)?.maxHeight) || undefined);
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay sheet={sheet}>
        <Animated.View style={sheet ? { width: '100%', transform: [{ translateY: drag.translateY }] } : { width: '100%' }}>
          <Reanimated.View style={[{ width: '100%' }, sheet ? cap : null]}>
          <DialogPrimitive.Content
            className={cn(
              'bg-background border-border z-50 mx-auto flex w-full max-w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg',
              Platform.select({
                web: 'animate-in fade-in-0 zoom-in-95 duration-200',
              }),
              sheet &&
                cn(
                  'max-w-full rounded-b-none rounded-t-3xl border-x-0 border-b-0 pt-0 sm:max-w-full',
                  Platform.select({ web: 'slide-in-from-bottom-full zoom-in-100 duration-300' })
                ),
              className
            )}
            style={[style, sheet ? { maxHeight: undefined, flexShrink: 1 } : null]}
            {...props}>
            {sheet ? <SheetHandle handlers={drag.handlers} /> : null}
            <>{children}</>
            {sheet ? <SheetBottomInset /> : null}
            <DialogPrimitive.Close
              className={cn(
                'absolute right-3 size-9 items-center justify-center rounded-full bg-secondary active:bg-accent',
                sheet ? 'top-5' : 'top-3',
                Platform.select({
                  web: 'ring-offset-background focus:ring-ring transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2',
                })
              )}
              role="button"
              accessibilityLabel="Close"
              hitSlop={8}>
              <Icon as={X} className={cn('text-foreground web:pointer-events-none size-4 shrink-0')} />
              <Text className="sr-only">Close</Text>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
          </Reanimated.View>
        </Animated.View>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return (
    <View className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-foreground text-lg font-semibold leading-none', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
