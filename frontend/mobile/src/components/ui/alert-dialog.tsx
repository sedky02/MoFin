import { usePhoneFrameOverlayStyle } from '@/components/shell/web-phone-frame';
import { buttonTextVariants, buttonVariants } from '@/components/ui/button';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { BACKDROP_IN_MS, SHEET_OUT_MS, SheetBottomInset, SheetHandle, useSheetKeyboard } from '@/components/ui/sheet-parts';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import Reanimated, { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Overlay>, 'asChild'> & {
    children?: React.ReactNode;
  }) {
  const frameStyle = usePhoneFrameOverlayStyle();
  const { lift } = useSheetKeyboard();
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay
        className={cn(
          // A bottom sheet on a phone, like the other dialogs: the choice sits under the thumb.
          'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-stretch justify-end bg-black/50 p-0',
          Platform.select({
            web: 'animate-in fade-in-0 fixed',
          }),
          className
        )}
        {...props}
        style={frameStyle}
        asChild={Platform.OS !== 'web'}>
        {/* The backdrop is there at once (a quick fade) and never slides with the sheet; on close it
            fades out over the same 200 ms the sheet takes to slide down, so they leave together. */}
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(BACKDROP_IN_MS).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(SHEET_OUT_MS).reduceMotion(ReduceMotion.System)}
          as="Pressable">
          {/* The type-to-confirm dialog has a field: the sheet rides up on the keyboard (see useSheetKeyboard). */}
          <Reanimated.View style={[{ width: '100%' }, lift]}>
            <NativeOnlyAnimatedView
              entering={SlideInDown.duration(260).reduceMotion(ReduceMotion.System)}
              exiting={SlideOutDown.duration(SHEET_OUT_MS).reduceMotion(ReduceMotion.System)}>
              {children}
            </NativeOnlyAnimatedView>
          </Reanimated.View>
        </NativeOnlyAnimatedView>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function AlertDialogContent({
  className,
  portalHost,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
    portalHost?: string;
  }) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn(
            'bg-background border-border z-50 flex w-full flex-col gap-4 rounded-t-3xl border-x-0 border-b-0 border-t px-6 pb-6 pt-2 shadow-lg shadow-black/5',
            Platform.select({
              web: 'animate-in fade-in-0 slide-in-from-bottom-full duration-300',
            }),
            className
          )}
          {...props}>
          {/* A handle like the other sheets, for the look; an alert closes only through its buttons. */}
          <SheetHandle />
          {props.children}
          <SheetBottomInset />
        </AlertDialogPrimitive.Content>
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-center sm:text-left">
      <View className={cn('flex flex-col gap-2', className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-foreground text-lg font-semibold', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className })}>
      <AlertDialogPrimitive.Action className={cn(buttonVariants(), className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className, variant: 'outline' })}>
      <AlertDialogPrimitive.Cancel
        className={cn(buttonVariants({ variant: 'outline' }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
