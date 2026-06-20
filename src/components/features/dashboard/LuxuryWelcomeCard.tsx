"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

const resolveBirthday = (value: unknown) => {
  if (!value) return false;

  let month: number | undefined;
  let day: number | undefined;

  if (typeof value === "string") {
    const isoMatch = value.trim().match(/^\d{4}-(\d{2})-(\d{2})/);
    if (isoMatch) {
      month = Number(isoMatch[1]);
      day = Number(isoMatch[2]);
    } else {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        month = parsed.getMonth() + 1;
        day = parsed.getDate();
      }
    }
  } else if (value instanceof Date) {
    month = value.getMonth() + 1;
    day = value.getDate();
  } else if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date };
    const parsed = typeof timestamp.toDate === "function" ? timestamp.toDate() : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      month = parsed.getMonth() + 1;
      day = parsed.getDate();
    }
  }

  const today = new Date();
  return month === today.getMonth() + 1 && day === today.getDate();
};

export function LuxuryWelcomeCard({
  children,
  roleLabel,
  contentAlign = "right",
}: {
  children?: ReactNode;
  roleLabel?: string;
  contentAlign?: "left" | "right";
}) {
  const { user } = useAuth();
  const displayName = String(user?.name || "").trim() || "Team Member";
  const store = String(user?.store || "").trim();
  const welcomeLabel = store
    ? `Welcome to MO DESIGNS PVT LTD. • ${store}`
    : "Welcome to MO DESIGNS PVT LTD.";
  const dateOfBirth =
    (user as any)?.dateOfBirth ??
    (user as any)?.dob ??
    (user as any)?.birthDate ??
    null;
  const isBirthdayToday = resolveBirthday(dateOfBirth);

  return (
    <Card className="relative overflow-hidden border border-[#d6b86a]/60 bg-[linear-gradient(118deg,#050505_0%,#100e09_38%,#20190c_72%,#3b2d11_100%)] text-[#fffaf0] shadow-[0_22px_60px_-28px_rgba(151,108,28,0.9)] ring-1 ring-black/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ffe39a] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#d4af55]/70 to-transparent" />
      <CardContent className="relative p-6 md:p-8">
        <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-[#f5c451]/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-52 w-52 rounded-full bg-[#9a681d]/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          {children && contentAlign === "left" ? (
            <div className="w-full lg:w-auto lg:flex-shrink-0">{children}</div>
          ) : null}
          <div className="min-w-0 max-w-3xl flex-1 space-y-2.5 overflow-hidden">
            <div className="luxury-word-slide flex w-max items-center gap-3">
              <span className="h-px w-8 bg-gradient-to-r from-[#f7d77d] to-transparent" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#f7d77d]">
                {welcomeLabel}
              </p>
            </div>
            <h1 className="luxury-signature-name bg-gradient-to-r from-white via-[#fff4cf] to-[#e6c66f] bg-clip-text text-4xl font-semibold text-transparent drop-shadow-[0_2px_10px_rgba(255,225,145,0.12)] md:text-5xl">
              {displayName}
            </h1>
            <p className="luxury-word-slide luxury-word-slide-delayed w-max max-w-none whitespace-nowrap text-sm leading-relaxed text-[#eee4ca]/85 md:text-base">
              {isBirthdayToday
                ? `Happy Birthday, ${displayName}! Wishing you a wonderful year ahead. 🎉`
                : "Have a great day! Let’s work together, stay focused, and make today successful."}
            </p>
            {roleLabel ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bda96e]/80">
                {roleLabel}
              </p>
            ) : null}
          </div>
          {children && contentAlign === "right" ? (
            <div className="flex w-full justify-end lg:ml-auto lg:w-auto lg:flex-shrink-0">{children}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
