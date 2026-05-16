"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkDialogProps {
  link: string | null;
  onClose: () => void;
}

export default function ShareLinkDialog({
  link,
  onClose,
}: ShareLinkDialogProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    if (link) {
      navigator.clipboard.writeText(link);
      toast({ title: "Copied!" });
    }
  };

  return (
    <Dialog open={!!link} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Share Visit Link</DialogTitle>
          <DialogDescription>
            Send this link for customer confirmation.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">
          <Input
            value={link || ""}
            readOnly
            className="rounded-lg border-slate-200 text-sm font-mono"
          />
        </div>
        <DialogFooter>
          <Button onClick={handleCopy} className="rounded-lg">
            <Copy className="mr-2 h-4 w-4" /> Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}