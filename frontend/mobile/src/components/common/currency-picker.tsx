import * as React from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { currencyName } from '@/core/currency-names';
import { currencyOptions } from '@/lib/currency-options';
import { Check, ChevronsUpDown, Search } from '@/lib/icons';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Codes to list first, under "In use". */
  pinned?: string[];
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
};

/**
 * A currency field with a search box. Matches the code or the name, so "euro" and "eur" both find EUR.
 * Currencies already in use come first while the search is empty. Opens a dialog on a phone, since a
 * popover has no room for a keyboard and a list.
 */
export function CurrencyPicker({ value, onChange, pinned = [], disabled, className, accessibilityLabel = 'Currency' }: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const options = React.useMemo(() => currencyOptions(query, pinned), [query, pinned]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        role="combobox"
        accessibilityLabel={`${accessibilityLabel}: ${value}, ${currencyName(value)}`}
        accessibilityHint="Opens a searchable list of currencies"
        aria-expanded={open}
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        className={cn(
          'dark:bg-input/30 border-input bg-background min-h-11 w-full min-w-0 flex-row items-center justify-between gap-2 rounded-md border px-3 shadow-sm shadow-black/5 active:bg-accent',
          disabled && 'opacity-50',
          className,
        )}>
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text className="font-medium" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
          <Text numberOfLines={1} className="shrink text-muted-foreground">
            {currencyName(value)}
          </Text>
        </View>
        <Icon as={ChevronsUpDown} size={16} aria-hidden className="text-muted-foreground" />
      </Pressable>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 p-0 sm:max-w-md" style={{ maxHeight: 560 }}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Currency</DialogTitle>
          </DialogHeader>
          <View className="relative mx-4 justify-center">
            <View pointerEvents="none" className="absolute left-3 z-10">
              <Icon as={Search} size={16} aria-hidden className="text-muted-foreground" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by code or name"
              accessibilityLabel="Search currencies"
              role="searchbox"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="search"
              className="border-input bg-background text-foreground min-h-11 rounded-md border pl-9 pr-3 text-base"
              placeholderTextColor="rgba(128,128,128,0.7)"
            />
          </View>
          {options.length === 0 ? (
            <Text className="px-6 py-6 text-center text-sm text-muted-foreground">
              No currency matches &ldquo;{query.trim()}&rdquo;.
            </Text>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(o) => `${o.group}-${o.code}`}
              keyboardShouldPersistTaps="handled"
              className="px-2 pb-3"
              style={{ flexGrow: 0, maxHeight: 288 }}
              accessibilityLabel="Currencies"
              renderItem={({ item: o, index }) => (
                <View>
                  {o.group && o.group !== options[index - 1]?.group ? (
                    <Text className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{o.group}</Text>
                  ) : null}
                  <Pressable
                    role="option"
                    aria-selected={o.code === value}
                    accessibilityLabel={`${o.code}, ${o.name}`}
                    onPress={() => pick(o.code)}
                    className="min-h-11 flex-row items-center gap-2 rounded-md px-2 active:bg-accent">
                    <Text className="w-12 shrink-0 text-sm font-medium">{o.code}</Text>
                    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">
                      {o.name}
                    </Text>
                    {o.code === value ? <Icon as={Check} size={16} aria-hidden /> : null}
                  </Pressable>
                </View>
              )}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
