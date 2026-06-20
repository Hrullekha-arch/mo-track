"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveStoreOptionsAction } from "@/components/features/user-management/store-options-actions";

const DEFAULT_STORE_OPTIONS = ["MO GCR BRANCH", "MO MG ROAD"];

export function AdminStoreOptions() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [stores, setStores] = useState<string[]>(DEFAULT_STORE_OPTIONS);
  const [newStoreName, setNewStoreName] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = String(user?.role || "").trim().toLowerCase() === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(doc(db, "appSettings", "storeOptions"), (snapshot) => {
      const storedOptions = snapshot.data()?.stores;
      setStores(
        Array.isArray(storedOptions) && storedOptions.length
          ? storedOptions.map((store) => String(store || "").trim()).filter(Boolean)
          : DEFAULT_STORE_OPTIONS
      );
    });
  }, [isAdmin]);

  if (!isAdmin) return null;

  const persist = async (nextStores: string[]) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const result = await saveStoreOptionsAction(
        nextStores,
        await firebaseUser.getIdToken()
      );
      toast({
        title: result.success ? "Store options updated" : "Update failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addStore = async () => {
    const storeName = newStoreName.trim().replace(/\s+/g, " ").toUpperCase();
    if (!storeName) return;
    if (stores.some((store) => store.toUpperCase() === storeName)) {
      toast({ variant: "destructive", title: "Store already exists" });
      return;
    }
    await persist([...stores, storeName]);
    setNewStoreName("");
  };

  return (
    <Card className="h-full border-amber-200 bg-gradient-to-br from-white to-amber-50/60 shadow-none">
      <CardHeader className="space-y-2 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">Store Management</CardTitle>
            <CardDescription className="text-xs">Admin-only user profile stores.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="flex gap-2">
          <Input
            value={newStoreName}
            onChange={(event) => setNewStoreName(event.target.value)}
            placeholder="Add store name"
            disabled={saving}
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void addStore()}
            disabled={saving || !newStoreName.trim()}
            className="h-9 shrink-0"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="sr-only">Add Store</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {stores.map((store) => (
            <div key={store} className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs">
              <span>{store}</span>
              <button
                type="button"
                className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                onClick={() => void persist(stores.filter((item) => item !== store))}
                disabled={saving || stores.length <= 1}
                aria-label={`Remove ${store}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
