import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Account } from '@/core/types';
import { cn } from '@/lib/utils';

const ALL = 'all';

export function AccountSwitcher({
  accounts,
  value,
  onChange,
  label = 'Filter by account',
  className,
}: {
  accounts: Account[];
  value?: string;
  onChange: (accountId?: string) => void;
  label?: string;
  className?: string;
}) {
  const selected = accounts.find((a) => a.id === value);
  const current = selected
    ? { value: selected.id, label: `${selected.name} (${selected.currency})` }
    : { value: ALL, label: 'All accounts' };
  return (
    <Select value={current} onValueChange={(o) => onChange(!o || o.value === ALL ? undefined : o.value)}>
      <SelectTrigger className={cn('min-h-11 w-full min-w-0 sm:h-11', className)} accessibilityLabel={`${label}: ${current.label}`} aria-label={`${label}: ${current.label}`}>
        <SelectValue placeholder="All accounts" />
      </SelectTrigger>
      <SelectContent className="min-w-60">
        <SelectItem value={ALL} label="All accounts" />
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id} label={`${a.name} (${a.currency})`} />
        ))}
      </SelectContent>
    </Select>
  );
}
