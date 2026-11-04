// The transaction form's pickers, as phone controls: the type switcher, the category chips, a
// dialog list for accounts and split-line categories (a popover has no room on a phone, and the
// dialog can be opened in tests), and the Month / Year interval switch. Same labels as the web's
// type-switcher, category-chips and account-select.
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CategoryGlyphIcon } from '@/components/categories/category-glyph';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account, Category, RecurringInterval, TransactionType } from '@/core/types';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, ChevronsUpDown, Plus } from '@/lib/icons';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS: { value: TransactionType; label: string; icon: LucideIcon; active: string }[] = [
  { value: 'EXPENSE', label: 'Expense', icon: ArrowUpRight, active: 'text-destructive' },
  { value: 'INCOME', label: 'Income', icon: ArrowDownLeft, active: 'text-success' },
  { value: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, active: 'text-primary-text' },
];

export function TypeSwitcher({
  value,
  onChange,
  disabled,
}: {
  value: TransactionType;
  onChange: (t: TransactionType) => void;
  disabled?: boolean;
}) {
  return (
    <View
      role="radiogroup"
      accessibilityLabel="Transaction type"
      aria-disabled={disabled || undefined}
      className="flex-row gap-1 rounded-xl bg-secondary/70 p-1">
      {TYPE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        const off = !!disabled && !selected;
        return (
          <Pressable
            key={opt.value}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: selected, disabled: off }}
            disabled={off}
            onPress={() => !disabled && onChange(opt.value)}
            className={cn(
              'min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg px-2 py-2',
              selected && 'bg-card shadow-sm shadow-black/5',
              off && 'opacity-50',
            )}>
            <Icon
              as={opt.icon}
              size={16}
              aria-hidden
              className={selected ? opt.active : 'text-muted-foreground'}
            />
            <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A category's icon in its colour, drawn the same way as everywhere else (`categoryGlyph`). */
export function CategoryGlyph({ category, size = 14 }: { category: Pick<Category, 'icon' | 'color' | 'name'>; size?: number }) {
  return <CategoryGlyphIcon category={category} size={size} color={category.color ?? undefined} />;
}

/**
 * One-tap category picker: a horizontally scrolling row of chips. Tapping the selected chip again
 * clears it (the category is optional).
 */
export function CategoryChips({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: Category[];
  value?: string;
  onChange: (id?: string) => void;
  /** Opens the new-category dialog ("New" chip). */
  onCreate?: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      role="radiogroup"
      accessibilityLabel="Category"
      contentContainerClassName="gap-2 pb-1">
      {categories.map((c) => {
        const selected = c.id === value;
        return (
          <Pressable
            key={c.id}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={c.name}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(selected ? undefined : c.id)}
            className={cn(
              'min-h-11 flex-row items-center gap-1.5 rounded-full px-3.5',
              selected ? 'bg-foreground' : 'bg-background/70',
            )}>
            <CategoryGlyph category={c} />
            <Text className={cn('text-sm', selected ? 'text-background' : 'text-muted-foreground')}>{c.name}</Text>
          </Pressable>
        );
      })}
      {onCreate ? (
        <Pressable
          role="button"
          accessibilityLabel="New category"
          onPress={onCreate}
          className="min-h-11 flex-row items-center gap-1 rounded-full border border-dashed border-border px-3.5 active:opacity-70">
          <Icon as={Plus} size={14} aria-hidden className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">New</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export type PickerOption = {
  value: string;
  label: string;
  /** Shown muted after the label (an account's currency). */
  detail?: string;
  leading?: React.ReactNode;
};

/**
 * A field that opens a dialog with a list to pick from. `placeholder` is what the field says with
 * nothing picked; `emptyOption` adds a first row that clears the pick (e.g. "Uncategorized").
 */
export function PickerField({
  title,
  accessibilityLabel,
  options,
  value,
  onChange,
  placeholder,
  emptyOption,
  emptyText,
  invalid,
  disabled,
  className,
  testID,
}: {
  title: string;
  accessibilityLabel: string;
  options: PickerOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  emptyOption?: string;
  /** Shown in the dialog when there are no options. */
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  testID?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  const rows: PickerOption[] = emptyOption ? [{ value: '', label: emptyOption }, ...options] : options;

  function pick(next: string) {
    onChange(next || undefined);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        role="combobox"
        testID={testID}
        accessibilityLabel={`${accessibilityLabel}: ${current ? `${current.label}${current.detail ? ` (${current.detail})` : ''}` : placeholder}`}
        accessibilityHint="Opens a list to choose from"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-12 flex-row items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 active:bg-muted',
          invalid && 'border border-destructive',
          disabled && 'opacity-50',
          className,
        )}>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {current?.leading}
          <Text numberOfLines={1} className={cn('shrink text-base', !current && 'text-muted-foreground')}>
            {current?.label ?? placeholder}
          </Text>
          {current?.detail ? (
            <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
              {current.detail}
            </Text>
          ) : null}
        </View>
        <Icon as={ChevronsUpDown} size={16} aria-hidden className="text-muted-foreground" />
      </Pressable>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 p-0 sm:max-w-md" style={{ maxHeight: 560 }}>
          <DialogHeader className="px-6 pt-2">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {rows.length === 0 ? (
            <Text className="px-6 pb-6 text-center text-sm text-muted-foreground">{emptyText}</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(o) => o.value || '__none'}
              className="px-2 pb-3"
              style={{ flexGrow: 0, maxHeight: 420 }}
              accessibilityLabel={title}
              renderItem={({ item: o }) => {
                const selected = (o.value || undefined) === value;
                return (
                  <Pressable
                    role="option"
                    aria-selected={selected}
                    accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
                    onPress={() => pick(o.value)}
                    // Thumb-sized rows in the sheet: 52 px tall, base text, selected row tinted.
                    className={cn('min-h-[52px] flex-row items-center gap-3 rounded-xl px-4 active:bg-accent', selected && 'bg-primary/10')}>
                    {o.leading}
                    <Text numberOfLines={1} className={cn('min-w-0 flex-1 text-base', selected && 'font-semibold')}>
                      {o.label}
                    </Text>
                    {o.detail ? (
                      <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                        {o.detail}
                      </Text>
                    ) : null}
                    {selected ? <Icon as={Check} size={18} aria-hidden className="text-primary-text" /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function accountOptions(accounts: Account[]): PickerOption[] {
  return accounts.map((a) => ({ value: a.id, label: a.name, detail: a.currency }));
}

export function categoryOptions(categories: Category[]): PickerOption[] {
  return categories.map((c) => ({ value: c.id, label: c.name, leading: <CategoryGlyph category={c} /> }));
}

const INTERVALS: { value: RecurringInterval; label: string }[] = [
  { value: 'MONTHLY', label: 'Month' },
  { value: 'YEARLY', label: 'Year' },
];

/** "Every Month / Year". Starts with neither chosen, like the web's "Choose interval" select. */
export function IntervalSwitcher({
  value,
  onChange,
  invalid,
}: {
  value?: RecurringInterval;
  onChange: (v: RecurringInterval) => void;
  invalid?: boolean;
}) {
  return (
    <View
      role="radiogroup"
      accessibilityLabel="Every"
      className={cn('flex-row gap-1 rounded-xl bg-background/70 p-1', invalid && 'border border-destructive')}>
      {INTERVALS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(opt.value)}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-lg px-3',
              selected && 'bg-card shadow-sm shadow-black/5',
            )}>
            <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
