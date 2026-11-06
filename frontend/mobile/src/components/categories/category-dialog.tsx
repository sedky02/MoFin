import * as React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { SheetScrollView } from '@/components/ui/sheet-parts';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ApiClientError } from '@/api/client';
import { categoryIconFor, collapsedCategoryIcons, orderedCategoryIcons } from '@/core/category-icons';
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from '@/core/constants';
import type { Category, CategoryType } from '@/core/types';
import { useCreateCategory, useUpdateCategory } from '@/hooks/useCategories';
import { Check, ChevronDown } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { CategoryAvatar } from './category-avatar';
import {
  CATEGORY_NAME_MAX,
  duplicateNameMessage,
  initialCategoryDraft,
  validateCategoryDraft,
  type CategoryDraft,
} from './category-form-state';

const COLLAPSED_ICONS = 7;

function CategoryDialogBody({
  open,
  onOpenChange,
  category,
  defaultType,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  defaultType?: CategoryType;
  onCreated?: (category: Category) => void;
}) {
  const isEdit = !!category;
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = React.useState<CategoryDraft>(() => initialCategoryDraft(category, defaultType));
  const [error, setError] = React.useState<string | undefined>();
  const [showAllIcons, setShowAllIcons] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const icon = draft.icon ?? '';
  // An emoji saved by an older version isn't in the set; keep it as a choice so editing doesn't lose it.
  const legacy = icon && !categoryIconFor(icon) ? icon : undefined;
  const icons = orderedCategoryIcons(draft.type);
  const shown = showAllIcons ? icons : collapsedCategoryIcons(icons, icon, legacy ? COLLAPSED_ICONS - 1 : COLLAPSED_ICONS);

  async function submit() {
    if (pending) return;
    const result = validateCategoryDraft(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const v = result.values;
    setError(undefined);
    setPending(true);
    try {
      if (category) {
        await updateMut.mutateAsync({ id: category.id, name: v.name, color: v.color, icon: v.icon || undefined });
      } else {
        const created = await createMut.mutateAsync({ name: v.name, type: v.type, color: v.color, icon: v.icon || undefined });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      // A taken name is said on the field, where the fix is; anything else was toasted by the hook.
      if (err instanceof ApiClientError && err.status === 409) setError(duplicateNameMessage(v.type, v.name));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" style={{ maxHeight: height - 32 }}>
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-3 pr-12">
          <CategoryAvatar category={{ name: draft.name || 'Category', color: draft.color, icon }} />
          <View className="min-w-0 flex-1">
            <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription className="mt-1">
              {isEdit ? 'Change how this category looks.' : 'Create a category to organize transactions.'}
            </DialogDescription>
          </View>
        </DialogHeader>

        <SheetScrollView contentContainerClassName="gap-4 px-4 py-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Name</Text>
            <Input
              value={draft.name}
              onChangeText={(name) => {
                setDraft((d) => ({ ...d, name }));
                if (error) setError(undefined);
              }}
              placeholder="e.g. Groceries"
              maxLength={CATEGORY_NAME_MAX + 10}
              autoComplete="off"
              accessibilityLabel="Name"
              className={cn('min-h-11', error && 'border-destructive')}
            />
            {error ? (
              <Text role="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
          </View>

          {/* Type: only on create (PATCH doesn't change type). */}
          {!isEdit ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">Type</Text>
              <View role="radiogroup" accessibilityLabel="Type" className="flex-row gap-1 rounded-lg bg-muted p-1">
                {(['EXPENSE', 'INCOME'] as const).map((t) => {
                  const selected = draft.type === t;
                  return (
                    <Pressable
                      key={t}
                      role="radio"
                      aria-checked={selected}
                      accessibilityState={{ selected }}
                      accessibilityLabel={t === 'EXPENSE' ? 'Expense' : 'Income'}
                      onPress={() => setDraft((d) => ({ ...d, type: t }))}
                      className={cn('min-h-11 flex-1 items-center justify-center rounded-md px-3', selected && 'bg-card shadow-sm shadow-black/5')}>
                      <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>
                        {t === 'EXPENSE' ? 'Expense' : 'Income'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="gap-4 rounded-xl bg-muted/40 p-3">
            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-medium">Icon</Text>
                <Pressable
                  role="button"
                  aria-pressed={!icon}
                  accessibilityState={{ selected: !icon }}
                  accessibilityLabel="Choose from the name"
                  onPress={() => setDraft((d) => ({ ...d, icon: '' }))}
                  className="min-h-11 flex-row items-center gap-1.5 px-2">
                  {!icon ? <Icon as={Check} size={14} aria-hidden /> : null}
                  <Text className={cn('text-xs font-medium', icon && 'text-muted-foreground')}>Choose from the name</Text>
                </Pressable>
              </View>
              <View role="group" accessibilityLabel="Icon" className="flex-row flex-wrap gap-2">
                {legacy ? (
                  <Pressable
                    role="button"
                    aria-pressed
                    accessibilityLabel={`Keep ${legacy}`}
                    onPress={() => setDraft((d) => ({ ...d, icon: legacy }))}
                    className="size-11 items-center justify-center rounded-lg border-2 border-primary bg-card">
                    <Text className="text-lg">{legacy}</Text>
                  </Pressable>
                ) : null}
                {shown.map(({ key, label, Icon: Glyph }) => {
                  const selected = icon === key;
                  return (
                    <Pressable
                      key={key}
                      role="button"
                      aria-pressed={selected}
                      accessibilityState={{ selected }}
                      accessibilityLabel={label}
                      onPress={() => setDraft((d) => ({ ...d, icon: key }))}
                      className={cn('size-11 items-center justify-center rounded-lg border-2 bg-card', selected ? 'border-primary' : 'border-border')}>
                      <Icon as={Glyph} size={20} color={selected ? draft.color : undefined} className={selected ? undefined : 'text-muted-foreground'} />
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                role="button"
                aria-expanded={showAllIcons}
                accessibilityLabel={showAllIcons ? 'Show fewer icons' : `Show all ${icons.length} icons`}
                onPress={() => setShowAllIcons((v) => !v)}
                className="min-h-11 flex-row items-center justify-center gap-1 self-center px-2">
                <Text className="text-xs font-medium text-muted-foreground">
                  {showAllIcons ? 'Show fewer icons' : `Show all ${icons.length} icons`}
                </Text>
                <Icon as={ChevronDown} size={14} aria-hidden className={cn('text-muted-foreground', showAllIcons && 'rotate-180')} />
              </Pressable>
              <Text className="text-xs text-muted-foreground">Pick an icon, or let MoFin choose one from the name.</Text>
            </View>

            <View className="gap-2">
              <Text className="text-sm font-medium">Color</Text>
              <View role="group" accessibilityLabel="Color" className="flex-row flex-wrap gap-x-2 gap-y-1">
                {CATEGORY_COLORS.map((c) => {
                  const selected = draft.color === c;
                  return (
                    <Pressable
                      key={c}
                      role="button"
                      aria-pressed={selected}
                      accessibilityState={{ selected }}
                      accessibilityLabel={CATEGORY_COLOR_NAMES[c] ?? c}
                      onPress={() => setDraft((d) => ({ ...d, color: c }))}
                      className="size-11 items-center justify-center">
                      <View
                        className={cn('size-8 items-center justify-center rounded-full border-2', selected ? 'border-foreground/60' : 'border-transparent')}
                        style={{ backgroundColor: c }}>
                        {selected ? <Icon as={Check} size={16} color="#fff" aria-hidden /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </SheetScrollView>

        <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" className="min-h-11" onPress={() => onOpenChange(false)} accessibilityLabel="Cancel">
            <Text>Cancel</Text>
          </Button>
          <Button className="min-h-11" disabled={pending} aria-busy={pending} onPress={submit}>
            <Text>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}

/** Mounts the form only while open, so every opening starts from fresh state. */
export function CategoryDialog(props: React.ComponentProps<typeof CategoryDialogBody>) {
  return props.open ? <CategoryDialogBody {...props} /> : null;
}
