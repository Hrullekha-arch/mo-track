
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User } from "@/lib/types";
import { Sparkles } from "lucide-react";

interface WelcomeDialogProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
};

export function WelcomeDialog({ user, isOpen, onClose }: WelcomeDialogProps) {
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
             <Sparkles className="h-6 w-6 text-yellow-400" />
            {greeting}, {user.name.split(" ")[0]}!
          </DialogTitle>
          <DialogDescription className="pt-2 text-base">
            Wishing you a wonderful and productive day ahead. Let's make today amazing!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Let's Go!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
