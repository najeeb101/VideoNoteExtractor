"use client";

import { useState, useEffect } from "react";
import { User, Mail, Shield, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export default function SettingsPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      {/* Profile */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Profile</h2>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user.email ?? ""} readOnly className="bg-muted/30 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input
              defaultValue={user.user_metadata?.full_name ?? ""}
              placeholder="Your name"
              readOnly
              className="bg-muted/30 text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">Managed by your OAuth provider.</p>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="mt-4 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Plan</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Free tier</span>
                <Badge variant="secondary">Current plan</Badge>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>3 videos per month</li>
                <li>Up to 20 minutes per video</li>
                <li>Notes deleted after 7 days</li>
              </ul>
            </div>
            <Button disabled variant="outline" className="gap-2">
              Upgrade to Pro
              <Badge className="ml-1 text-[10px]">Soon</Badge>
            </Button>
          </div>
        </div>
      </section>

      {/* Auth */}
      <section className="mt-4 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Authentication</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Signed in as</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground capitalize">
                via {user.app_metadata?.provider ?? "email"}
              </p>
            </div>
            <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="mt-4 rounded-lg border border-destructive/30 bg-card">
        <div className="border-b border-destructive/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h2 className="font-medium text-destructive">Danger zone</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all notes. This cannot be undone.</p>
            </div>
            {!deleteConfirm ? (
              <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(true)}>
                Delete account
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm delete"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
