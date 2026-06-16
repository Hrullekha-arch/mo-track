"use client";

import * as React from "react";
import { Bot, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type BotSettings = {
  enabled: boolean;
  updatedAt?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: "success" | "partial" | "failed" | "disabled" | null;
  lastRunSummary?: {
    processed: number;
    synced: number;
    failed: number;
    skipped: number;
  } | null;
};

export function ZohoInvoiceBotCard({
  onEnabledChange,
}: {
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<BotSettings | null>(null);
  const [canManage, setCanManage] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);

  const request = React.useCallback(
    async (input?: { enabled: boolean }) => {
      if (!firebaseUser) throw new Error("Login required.");
      const token = await firebaseUser.getIdToken();
      const response = await fetch("/api/zoho-sync/bot-settings", {
        method: input ? "PATCH" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(input ? { "Content-Type": "application/json" } : {}),
        },
        body: input ? JSON.stringify(input) : undefined,
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Unable to load Zoho bot settings."));
      }
      setSettings(result.settings);
      onEnabledChange?.(result.settings?.enabled === true);
      setCanManage(result.canManage === true);
      return result.settings as BotSettings;
    },
    [firebaseUser, onEnabledChange]
  );

  React.useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    setLoading(true);
    void request()
      .catch((error: any) => {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Zoho bot status unavailable",
            description: error?.message || "Unable to load bot settings.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, request, toast]);

  const toggle = async (enabled: boolean) => {
    setUpdating(true);
    try {
      await request({ enabled });
      toast({
        title: enabled ? "Zoho Bot activated" : "Zoho Bot deactivated",
        description: enabled
          ? "Approved invoices will now synchronize automatically."
          : "Zoho synchronization is paused. Invoices will still be created in Mo Track.",
      });

      if (enabled && firebaseUser) {
        const token = await firebaseUser.getIdToken();
        void fetch("/api/zoho-sync/sync-invoice", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Zoho Bot update failed",
        description: error?.message || "Unable to update the bot.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const lastRunText = settings?.lastRunAt
    ? new Date(settings.lastRunAt).toLocaleString("en-IN")
    : "Not run yet";

  return (
    <Card className="border-sky-200 bg-sky-50/40">
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Automated Zoho Invoice Bot</p>
              <Badge
                variant="outline"
                className={
                  settings?.enabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600"
                }
              >
                {settings?.enabled ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings?.enabled
                ? "Approved invoices are validated and created in Zoho Books automatically."
                : "Invoices are created only in Mo Track while Zoho synchronization is inactive."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last run: {lastRunText}
              {settings?.lastRunSummary
                ? ` | ${settings.lastRunSummary.synced} synced, ${settings.lastRunSummary.failed} failed`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading || updating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <Switch
            checked={settings?.enabled === true}
            onCheckedChange={(checked) => void toggle(checked)}
            disabled={loading || updating || !canManage}
            aria-label="Toggle automated Zoho invoice bot"
          />
          <span className="text-xs text-muted-foreground">
            {canManage ? "Admin control" : "Admin, IT, or Data Analytics only"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
