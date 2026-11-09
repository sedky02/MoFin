import { cn } from '@/lib/utils';
import { usePlaceholderColor } from '@/hooks/use-placeholder-color';
import { Platform, TextInput } from 'react-native';


function Input({
  className,
  placeholderClassName,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  const placeholderColor = usePlaceholderColor();
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex min-h-11 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'sm:h-9 placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
        }),
        className
      )}
      // Without an explicit colour Android uses the phone's hint colour, near-white in a light-mode
      // app on a dark-mode phone, so the placeholder vanished.
      placeholderTextColor={placeholderColor}
      placeholderClassName={placeholderClassName}
      {...props}
    />
  );
}

export { Input };
