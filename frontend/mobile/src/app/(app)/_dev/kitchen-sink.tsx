import { Inbox } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountTypePicker } from '@/components/common/account-type-picker';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CurrencyPicker } from '@/components/common/currency-picker';
import { MoneyAmount } from '@/components/common/money-amount';
import { MoneyInput } from '@/components/common/money-input';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, SkeletonCard, SkeletonRows } from '@/components/common/states';
import { TypeToConfirmDialog } from '@/components/common/type-to-confirm-dialog';
import { AccountSwitcher } from '@/components/shell/account-switcher';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import type { Account, AccountType } from '@/core/types';
import { THEME_LABELS, useThemePreference, type ThemePreference } from '@/hooks/use-theme-preference';
import { toast } from '@/lib/toast';

// Development only (the route is guarded by __DEV__ in (app)/_layout.tsx). Every primitive in one place,
// to check light and dark, loading, empty and error states.

const DEMO_ACCOUNTS = [
  { id: 'a1', name: 'Everyday', currency: 'USD' },
  { id: 'a2', name: 'Savings', currency: 'EUR' },
] as Account[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text role="heading" aria-level={2} className="text-lg font-semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function KitchenSink() {
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useThemePreference();
  const [money, setMoney] = React.useState('1234.5');
  const [signed, setSigned] = React.useState('-12');
  const [currency, setCurrency] = React.useState('USD');
  const [accountType, setAccountType] = React.useState<AccountType>('BANK');
  const [accountId, setAccountId] = React.useState<string | undefined>();
  const [fruit, setFruit] = React.useState<{ value: string; label: string } | undefined>();
  const [on, setOn] = React.useState(true);
  const [tab, setTab] = React.useState('one');
  const [dialog, setDialog] = React.useState(false);
  const [alert, setAlert] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [typed, setTyped] = React.useState(false);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-8 p-4"
      contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
      keyboardShouldPersistTaps="handled">
      <PageHeader title="Kitchen sink" description="Every building block, in the current theme." />

      <Section title="Theme">
        <Tabs value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
          <TabsList className="h-11 w-full">
            {(Object.keys(THEME_LABELS) as ThemePreference[]).map((p) => (
              <TabsTrigger key={p} value={p} className="flex-1" accessibilityLabel={`${THEME_LABELS[p]} theme`}>
                <Text>{THEME_LABELS[p]}</Text>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Text">
        <Text variant="h3">Heading</Text>
        <Text>Body text that scales with the system font size.</Text>
        <Text variant="muted">Muted helper text</Text>
        <Text className="text-destructive">Error text</Text>
      </Section>

      <Section title="Buttons">
        <View className="flex-row flex-wrap gap-2">
          <Button><Text>Default</Text></Button>
          <Button variant="secondary"><Text>Secondary</Text></Button>
          <Button variant="outline"><Text>Outline</Text></Button>
          <Button variant="ghost"><Text>Ghost</Text></Button>
          <Button variant="destructive"><Text>Destructive</Text></Button>
          <Button disabled><Text>Disabled</Text></Button>
        </View>
      </Section>

      <Section title="Badges">
        <View className="flex-row flex-wrap gap-2">
          <Badge><Text>3</Text></Badge>
          <Badge variant="secondary"><Text>Secondary</Text></Badge>
          <Badge variant="destructive"><Text>Destructive</Text></Badge>
          <Badge variant="outline"><Text>Outline</Text></Badge>
        </View>
      </Section>

      <Section title="Fields">
        <View className="gap-1.5">
          <Label nativeID="ks-name">Name</Label>
          <Input aria-labelledby="ks-name" placeholder="Everyday account" accessibilityLabel="Name" className="h-11 sm:h-11" />
        </View>
        <View className="gap-1.5">
          <Label nativeID="ks-note">Note</Label>
          <Textarea aria-labelledby="ks-note" accessibilityLabel="Note" placeholder="Optional note" />
        </View>
        <View className="flex-row items-center justify-between gap-3 min-h-11">
          <Label nativeID="ks-switch" onPress={() => setOn((v) => !v)}>Recurring</Label>
          <Switch checked={on} onCheckedChange={setOn} aria-labelledby="ks-switch" accessibilityLabel="Recurring" />
        </View>
        <View className="gap-1.5">
          <Label nativeID="ks-select">Fruit</Label>
          <Select value={fruit} onValueChange={(o) => setFruit(o ?? undefined)}>
            <SelectTrigger className="h-11 w-full sm:h-11" accessibilityLabel="Fruit">
              <SelectValue placeholder="Select a fruit" />
            </SelectTrigger>
            <SelectContent className="min-w-60">
              <SelectItem value="apple" label="Apple" />
              <SelectItem value="pear" label="Pear" />
              <SelectItem value="plum" label="Plum" />
            </SelectContent>
          </Select>
        </View>
      </Section>

      <Section title="Money">
        <MoneyAmount amount="1234.5" currency="USD" className="text-2xl font-semibold" />
        <MoneyAmount amount="-87.1" currency="EUR" colorBySign />
        <MoneyAmount amount="42" currency="TND" colorBySign signed />
        <MoneyAmount amount="1250000" currency="USD" compact />
        <MoneyInput value={money} onChange={setMoney} currency="USD" />
        <MoneyInput value={signed} onChange={setSigned} currency="EUR" allowNegative />
        <MoneyInput large value={money} onChange={setMoney} currency="USD" />
        <MoneyInput value="1,234" onChange={() => {}} currency="USD" invalid />
        <CurrencyPicker value={currency} onChange={setCurrency} pinned={['USD', 'EUR']} />
        <AccountTypePicker value={accountType} onChange={setAccountType} />
      </Section>

      <Section title="Account switcher">
        <AccountSwitcher accounts={DEMO_ACCOUNTS} value={accountId} onChange={setAccountId} />
      </Section>

      <Section title="Tabs and separator">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-11 w-full">
            <TabsTrigger value="one" className="flex-1"><Text>One</Text></TabsTrigger>
            <TabsTrigger value="two" className="flex-1"><Text>Two</Text></TabsTrigger>
          </TabsList>
          <TabsContent value="one"><Text variant="muted">First panel</Text></TabsContent>
          <TabsContent value="two"><Text variant="muted">Second panel</Text></TabsContent>
        </Tabs>
        <Separator />
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent><Text>Card content</Text></CardContent>
        </Card>
      </Section>

      <Section title="Loading">
        <Skeleton className="h-4 w-48" />
        <SkeletonCard />
        <SkeletonRows rows={3} />
      </Section>

      <Section title="Empty">
        <EmptyState
          icon={Inbox}
          title="No transactions yet"
          description="Record your first transaction to see it here."
          action={<Button><Text>New Transaction</Text></Button>}
        />
      </Section>

      <Section title="Error">
        <ErrorState description="We couldn't load this. Check your connection and try again." onRetry={() => toast.success('Retrying')} />
      </Section>

      <Section title="Dialogs">
        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" onPress={() => setDialog(true)}><Text>Dialog</Text></Button>
          <Button variant="outline" onPress={() => setAlert(true)}><Text>Alert dialog</Text></Button>
          <Button variant="outline" onPress={() => setConfirm(true)}><Text>Confirm</Text></Button>
          <Button variant="destructive" onPress={() => setTyped(true)}><Text>Type to confirm</Text></Button>
        </View>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>A dialog with a close button and a footer.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onPress={() => setDialog(false)}><Text>Done</Text></Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={alert} onOpenChange={setAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This needs an explicit answer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel><Text>Cancel</Text></AlertDialogCancel>
              <AlertDialogAction><Text>Continue</Text></AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Delete this account?"
          description="Its transactions are deleted too."
          confirmLabel="Delete"
          onConfirm={() => toast.success('Deleted')}
        />
        <TypeToConfirmDialog
          open={typed}
          onOpenChange={setTyped}
          title="Delete all data?"
          description="This can't be undone."
          actionLabel="Delete everything"
          pendingText="Deleting…"
          failureMessage="Couldn't delete your data."
          onConfirm={() => new Promise<void>((r) => setTimeout(r, 600))}
        />
      </Section>

      <Section title="Toasts">
        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" onPress={() => toast.success('Transaction recorded.')}><Text>Success</Text></Button>
          <Button variant="outline" onPress={() => toast.error('Couldn’t save.', { description: 'Check your connection and try again.' })}><Text>Error</Text></Button>
          <Button
            variant="outline"
            onPress={() =>
              toast.success('Transaction deleted.', {
                action: { label: 'Undo', onClick: () => toast.success('Restored.') },
                cancel: { label: 'Keep', onClick: () => {} },
              })
            }>
            <Text>With actions</Text>
          </Button>
        </View>
      </Section>
    </ScrollView>
  );
}
