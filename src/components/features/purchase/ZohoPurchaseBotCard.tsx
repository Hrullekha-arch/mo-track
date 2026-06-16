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
  lastRunAt?: string | null;
  lastRunSummary?: {
    processed: number;
    synced: number;
    failed: number;
    skipped: number;
  } | null;
};

export function ZohoPurchaseBotCard({
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
      const response = await fetch("/api/zoho-sync/purchase-bot-settings", {
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
        throw new Error(String(result?.error || "Unable to load Zoho PO bot settings."));
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
            title: "Zoho PO bot status unavailable",
            description: error?.message || "Unable to load purchase bot settings.",
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
        title: enabled ? "Zoho PO Bot activated" : "Zoho PO Bot deactivated",
        description: enabled
          ? "New purchase orders will now be created in Zoho."
          : "Purchase orders will be created only in Mo Track.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Zoho PO Bot update failed",
        description: error?.message || "Unable to update the purchase bot.",
      });
    } finally {
      setUpdating(false);
    }
  };

  if (!canManage && !loading) return null;

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
              <p className="font-semibold">Automated Zoho Purchase Order Bot</p>
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
                ? "Purchase orders are created in Zoho Books after Mo Track approval."
                : "Purchase orders are created only in Mo Track while Zoho synchronization is inactive."}
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
            aria-label="Toggle automated Zoho purchase order bot"
          />
          <span className="text-xs text-muted-foreground">Admin control</span>
        </div>
      </CardContent>
    </Card>
  );
}
