import { TriangleAlert, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * A Settings section (the web's SettingsCard): an icon tile and a short description, then the
 * section's content. "danger" turns it red. Each section is its own page whose stack header already
 * shows the section's name, so the card doesn't print it again (`title` stays for callers and tests).
 */
export function SettingsSectionCard({
  description,
  icon,
  action,
  tone = 'default',
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  tone?: 'default' | 'danger';
  children?: React.ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <View
      className={cn(
        'rounded-xl bg-card p-5 shadow-sm shadow-black/5',
        danger ? 'border border-destructive/30 bg-destructive/[0.03]' : 'border border-border',
      )}>
      <View className="flex-row items-start gap-3.5">
        {icon ? (
          <View
            aria-hidden
            className={cn('size-10 shrink-0 items-center justify-center rounded-xl', danger ? 'bg-destructive/10' : 'bg-primary/15')}>
            <Icon as={icon} size={20} className={danger ? 'text-destructive' : 'text-primary-text'} />
          </View>
        ) : null}
        <View className="min-h-10 min-w-0 flex-1 justify-center">
          {typeof description === 'string' ? (
            <Text className={cn('text-sm text-muted-foreground', danger && 'text-destructive')}>{description}</Text>
          ) : (
            description
          )}
        </View>
      </View>
      {action ? <View className="mt-4">{action}</View> : null}
      {children ? <View className="mt-5">{children}</View> : null}
    </View>
  );
}

/** One action inside a section: what it does, then its button (stacked: a phone has no room beside). */
export function SettingsRow({
  title,
  description,
  children,
  tone = 'default',
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** "danger": a red warning row, for something that can't be undone. */
  tone?: 'default' | 'danger';
  className?: string;
}) {
  const danger = tone === 'danger';
  return (
    <View
      className={cn(
        'gap-3 rounded-xl border p-4',
        danger ? 'border-destructive/30 bg-destructive/[0.04]' : 'border-border',
        className,
      )}>
      <View className="min-w-0">
        <View className="flex-row items-center gap-1.5">
          {danger ? <Icon as={TriangleAlert} size={16} aria-hidden className="text-destructive" /> : null}
          <Text role="heading" aria-level={3} className={cn('shrink text-sm font-medium', danger && 'text-destructive')}>
            {title}
          </Text>
        </View>
        {description ? <Text className="mt-0.5 text-sm text-muted-foreground">{description}</Text> : null}
      </View>
      <View>{children}</View>
    </View>
  );
}
