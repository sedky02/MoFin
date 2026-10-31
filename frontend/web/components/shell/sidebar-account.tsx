"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { initials, useSignOut } from "./user-menu";

/** Who is signed in, with a Sign out button: the end of the sidebar. Just the avatar and the button when collapsed. */
export function SidebarAccount({ collapsed = false }: { collapsed?: boolean }) {
  const { data: user } = useUser();
  const { logout, loggingOut } = useSignOut();
  const name = user?.displayName || user?.email || "Account";

  const signOut = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={logout}
      disabled={loggingOut}
      aria-label={loggingOut ? "Signing out…" : "Sign out"}
    >
      <LogOut className="size-4" />
    </Button>
  );

  const avatar = (
    <Avatar className="size-8 shrink-0">
      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary-text">
        {initials(user?.displayName, user?.email)}
      </AvatarFallback>
    </Avatar>
  );

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-sidebar-border pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={name} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {avatar}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {name}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>{signOut}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            Sign out
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-3")}>
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user?.displayName || "Welcome"}</p>
        {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
      </div>
      {signOut}
    </div>
  );
}
