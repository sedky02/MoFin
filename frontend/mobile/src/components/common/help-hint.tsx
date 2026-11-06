import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Info } from '@/lib/icons';

/** An explanation that shouldn't take up room on the screen. No hover on a phone, so a tap opens it. */
export function HelpHint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="size-11" accessibilityLabel={label} onPress={() => setOpen(true)}>
        <Icon as={Info} size={16} className="text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{children}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
