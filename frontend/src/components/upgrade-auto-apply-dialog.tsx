"use client";

import { Crown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UpgradeAutoApplyDialog({
  open,
  onOpenChange,
  title = "Upgrade to Auto-Apply",
  description = "Auto-Apply is a premium plan feature. An admin must allow it on your account before you can turn it on. Contact your admin to upgrade your plan and start applying automatically.",
  mailSubject = "Upgrade to Auto-Apply",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  mailSubject?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
            <Crown className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              window.location.href = `mailto:admin@autoapply.io?subject=${encodeURIComponent(mailSubject)}`;
              onOpenChange(false);
            }}
          >
            <Mail className="mr-2 size-4" />
            Contact admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
