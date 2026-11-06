// "More filters" in a bottom sheet (a phone has no room for the web's inline panel, and the sheet
// keeps Done near the thumb); changes apply to the list straight away.
import * as React from 'react';
import { View } from 'react-native';

import { SheetScrollView } from '@/components/ui/sheet-parts';

import { DateTimeField } from '@/components/transactions/datetime-field';
import { PickerField } from '@/components/transactions/transaction-form-fields';
import { REPEATS_OPTIONS, SCHEDULES, sortOrDefault, type ListFilters } from '@/components/transactions/transactions-list-model';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { SORT_OPTIONS, TYPE_OPTIONS } from '@/core/transaction-list-params';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      {children}
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  onClear,
  hasActive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
  onClear: () => void;
  hasActive: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 pb-3 pt-2 pr-12 text-left sm:text-left">
          <DialogTitle>More filters</DialogTitle>
          <DialogDescription>Narrow the list by type, dates, amount and more.</DialogDescription>
        </DialogHeader>
        <SheetScrollView contentContainerClassName="gap-4 px-4 py-4">
          <Field label="Type">
            <PickerField
              title="Type"
              accessibilityLabel="Type"
              options={TYPE_OPTIONS}
              value={filters.type || undefined}
              onChange={(v) => onChange({ type: v ?? '' })}
              placeholder="All types"
              emptyOption="All types"
            />
          </Field>
          <Field
            label="Repeats"
            hint={filters.recurrence === SCHEDULES ? 'One row per schedule, to pause or cancel it.' : undefined}>
            <PickerField
              title="Repeats"
              accessibilityLabel="Repeats"
              options={REPEATS_OPTIONS}
              value={filters.recurrence || undefined}
              onChange={(v) => onChange({ recurrence: v ?? '' })}
              placeholder="All transactions"
              emptyOption="All transactions"
            />
          </Field>
          <Field label="Sort by">
            <PickerField
              title="Sort by"
              accessibilityLabel="Sort by"
              options={SORT_OPTIONS}
              value={filters.sort}
              onChange={(v) => onChange({ sort: sortOrDefault(v) })}
              placeholder="Newest first"
            />
          </Field>
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1">
              <Field label="From date">
                <DateTimeField mode="date" value={filters.from} onChange={(v) => onChange({ from: v })} accessibilityLabel="From date" placeholder="Any date" clearable />
              </Field>
            </View>
            <View className="min-w-0 flex-1">
              <Field label="To date">
                <DateTimeField mode="date" value={filters.to} onChange={(v) => onChange({ to: v })} accessibilityLabel="To date" placeholder="Any date" clearable />
              </Field>
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1">
              <Field label="Min amount">
                <Input
                  value={filters.minAmount}
                  onChangeText={(v) => onChange({ minAmount: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  accessibilityLabel="Min amount"
                  className="min-h-12 rounded-xl border-0 bg-muted/50"
                  style={{ fontVariant: ['tabular-nums'] }}
                />
              </Field>
            </View>
            <View className="min-w-0 flex-1">
              <Field label="Max amount">
                <Input
                  value={filters.maxAmount}
                  onChangeText={(v) => onChange({ maxAmount: v })}
                  keyboardType="decimal-pad"
                  placeholder="Any"
                  accessibilityLabel="Max amount"
                  className="min-h-12 rounded-xl border-0 bg-muted/50"
                  style={{ fontVariant: ['tabular-nums'] }}
                />
              </Field>
            </View>
          </View>
        </SheetScrollView>
        <View className="flex-row gap-2 border-t border-border px-4 py-3">
          {hasActive ? (
            <Button variant="outline" className="min-h-12 flex-1" accessibilityLabel="Clear all filters" onPress={onClear}>
              <Text>Clear all</Text>
            </Button>
          ) : null}
          <Button className="min-h-12 flex-1" accessibilityLabel="Done" onPress={() => onOpenChange(false)}>
            <Text>Done</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}
