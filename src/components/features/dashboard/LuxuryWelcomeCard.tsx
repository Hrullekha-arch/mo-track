"use client";

import { useEffect, useState, type ReactNode } from "react";
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

const resolveWorkAnniversaryYears = (value: unknown) => {
  if (!value) return 0;

  let joiningDate: Date | null = null;
  if (typeof value === "string") {
    const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    joiningDate = isoMatch
      ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
      : new Date(value);
  } else if (value instanceof Date) {
    joiningDate = value;
  } else if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date };
    joiningDate = typeof timestamp.toDate === "function" ? timestamp.toDate() : null;
  }

  if (!joiningDate || Number.isNaN(joiningDate.getTime())) return 0;
  const today = new Date();
  const isAnniversaryToday =
    joiningDate.getMonth() === today.getMonth() &&
    joiningDate.getDate() === today.getDate();
  const completedYears = today.getFullYear() - joiningDate.getFullYear();
  return isAnniversaryToday && completedYears > 0 ? completedYears : 0;
};

const ordinal = (value: number) => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
};

const normalizeRoleKey = (value: unknown) =>
  String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");

const ROLE_GREETING_SETS: Record<string, string[]> = {
  admin: [
    "Lead with clarity today—your decisions shape the success of every team.",
    "Turn today’s priorities into measurable progress across the organization.",
    "Strong leadership creates confident teams. Keep the momentum moving.",
    "Build alignment, remove roadblocks, and make today count.",
  ],
  md: [
    "Your vision sets the direction—let today’s decisions create lasting growth.",
    "Lead boldly, think strategically, and inspire excellence across every team.",
    "Transform opportunity into progress through clear and decisive leadership.",
    "A focused vision creates an exceptional organization. Make today impactful.",
  ],
  crm: [
    "Every customer conversation is an opportunity to build lasting trust.",
    "Stay connected, follow through, and turn today’s leads into relationships.",
    "Great CRM work combines care, clarity, and consistent follow-up.",
    "Make every customer feel heard, valued, and confidently supported today.",
  ],
  pc: [
    "Keep every order moving—your coordination turns plans into completion.",
    "Spot the bottleneck, clear the path, and protect today’s delivery promise.",
    "Strong production control creates smooth execution and satisfied customers.",
    "Monitor closely, coordinate clearly, and move every milestone forward.",
  ],
  ea: [
    "Bring clarity to every priority and precision to every important follow-up.",
    "Your coordination keeps leadership focused and the organization moving.",
    "Anticipate the next need, organize the details, and make today seamless.",
    "Excellent execution begins with thoughtful planning and timely action.",
  ],
  allocator: [
    "Smart allocation today creates faster execution and stronger delivery.",
    "Match every requirement carefully and keep the operational flow moving.",
    "Precision in allocation prevents delays and protects customer commitments.",
    "Allocate with clarity, communicate early, and keep every order on track.",
  ],
  salesman: [
    "Create trust, understand the need, and turn every conversation into value.",
    "Follow up with purpose—today’s connection can become tomorrow’s success.",
    "Listen carefully, recommend confidently, and deliver a premium experience.",
    "Every lead deserves energy, consistency, and a clear next step.",
  ],
  salesmanager: [
    "Coach with purpose, guide the pipeline, and help every salesperson succeed.",
    "Clear direction and timely support turn a sales team into a winning team.",
    "Review the numbers, strengthen the follow-up, and lead from the front today.",
    "Build confidence, create accountability, and move every opportunity forward.",
  ],
  hr: [
    "Support people with empathy, strengthen culture, and help every team thrive.",
    "Great workplaces grow through thoughtful people operations and timely care.",
    "Your work empowers employees to perform, develop, and succeed together.",
    "Build trust, encourage growth, and make today meaningful for every employee.",
  ],
  recruiter: [
    "Every strong hire begins with a thoughtful conversation and careful judgment.",
    "Connect the right talent with the right opportunity and shape a stronger team.",
    "Look beyond the résumé—find the potential that can grow with the organization.",
    "A great candidate experience strengthens our reputation and our future.",
  ],
  analytics: [
    "Turn today’s data into clarity, insight, and confident business decisions.",
    "Find the pattern, verify the detail, and make every report meaningful.",
    "Accurate analysis reveals opportunities that others may overlook.",
    "Transform complex information into actions the whole team can understand.",
  ],
  technology: [
    "Build thoughtfully, solve the right problem, and make every system more reliable.",
    "Clean solutions and careful testing create technology people can trust.",
    "Improve one workflow today and multiply productivity across the organization.",
    "Turn business challenges into simple, secure, and dependable solutions.",
  ],
  accounts: [
    "Accuracy creates confidence—keep every number clear and every action timely.",
    "Protect the business through precise records, disciplined checks, and focus.",
    "Financial clarity supports stronger decisions across the entire organization.",
    "Reconcile carefully, communicate clearly, and close today with confidence.",
  ],
  purchase: [
    "Source smartly, follow up early, and keep every material commitment on time.",
    "Strong purchasing balances quality, timing, value, and dependable partners.",
    "Every timely purchase keeps production moving and customer promises intact.",
    "Plan ahead, verify every detail, and prevent tomorrow’s delays today.",
  ],
  installer: [
    "Finish with precision—your workmanship completes the customer experience.",
    "Every detail matters when turning a delivered product into a finished result.",
    "Work safely, communicate clearly, and leave every installation exceptional.",
    "Your final touch transforms careful planning into customer satisfaction.",
  ],
  employee: [
    "Your consistency makes a difference—let’s achieve today’s goals together.",
    "Every completed task moves the whole team forward. Keep up the good work!",
    "One task at a time, one milestone at a time—make today productive.",
    "Thank you for your contribution. Stay focused and keep delivering excellence.",
  ],
};

const resolveGreetingCategory = (role: unknown, designation: unknown) => {
  const roleKey = normalizeRoleKey(role);
  const designationKey = normalizeRoleKey(designation);
  if (
    ["md", "management", "managingdirector"].includes(roleKey) ||
    ["md", "management", "managingdirector"].includes(designationKey)
  ) return "md";
  if (designationKey === "crm" || roleKey === "crm") return "crm";
  if (designationKey === "pc" || roleKey === "pc") return "pc";
  if (designationKey === "ea" || roleKey === "ea") return "ea";
  if (
    ["allocator", "allocators", "allocater"].includes(designationKey) ||
    ["allocator", "allocators", "allocater"].includes(roleKey)
  ) return "allocator";
  if (roleKey === "salesman" || designationKey === "salesman") return "salesman";
  if (
    ["salesmanager", "headsalesmanager"].includes(roleKey) ||
    ["salesmanager", "headsalesmanager"].includes(designationKey)
  ) return "salesmanager";
  if (roleKey === "hr" || designationKey === "hr") return "hr";
  if (designationKey === "recruiter" || roleKey === "recruiter") return "recruiter";
  if (
    designationKey.includes("analytics") ||
    designationKey.includes("mis") ||
    roleKey.includes("analytics")
  ) return "analytics";
  if (
    designationKey.includes("softwaredeveloper") ||
    designationKey.includes("erpdevelopment") ||
    roleKey === "it"
  ) return "technology";
  if (
    ["account", "accounts"].includes(roleKey) ||
    ["account", "accounts"].includes(designationKey)
  ) return "accounts";
  if (roleKey === "purchase" || designationKey === "purchase") return "purchase";
  if (roleKey === "installer" || designationKey === "installer") return "installer";
  if (roleKey === "admin") return "admin";
  return "employee";
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
  const joiningDate =
    (user as any)?.joiningDate ??
    (user as any)?.dateOfJoining ??
    (user as any)?.joinDate ??
    (user as any)?.hiredAt ??
    null;
  const anniversaryYears = resolveWorkAnniversaryYears(joiningDate);
  const greetingCategory = resolveGreetingCategory(user?.role, user?.designation);
  const roleGreetings =
    ROLE_GREETING_SETS[greetingCategory] || ROLE_GREETING_SETS.employee;
  const [greetingIndex, setGreetingIndex] = useState(0);
  const pauseGreetingRotation = isBirthdayToday || anniversaryYears > 0;

  useEffect(() => {
    setGreetingIndex(0);
    if (pauseGreetingRotation) return;
    const timer = window.setInterval(() => {
      setGreetingIndex((current) => (current + 1) % 4);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [pauseGreetingRotation, greetingCategory]);

  return (
    <Card className="relative w-full min-w-0 overflow-hidden border border-[#d6b86a]/60 bg-[linear-gradient(118deg,#050505_0%,#100e09_38%,#20190c_72%,#3b2d11_100%)] text-[#fffaf0] shadow-[0_22px_60px_-28px_rgba(151,108,28,0.9)] ring-1 ring-black/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ffe39a] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#d4af55]/70 to-transparent" />
      <CardContent className="relative p-4 sm:p-6 md:p-8">
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
            <h1 className="luxury-signature-name break-words bg-gradient-to-r from-white via-[#fff4cf] to-[#e6c66f] bg-clip-text text-3xl font-semibold text-transparent drop-shadow-[0_2px_10px_rgba(255,225,145,0.12)] sm:text-4xl md:text-5xl">
              {displayName}
            </h1>
            <p className="luxury-word-slide luxury-word-slide-delayed max-w-full text-sm leading-relaxed text-[#eee4ca]/85 sm:w-max sm:max-w-none sm:whitespace-nowrap md:text-base">
              {isBirthdayToday
                ? `Happy Birthday, ${displayName}! Wishing you a wonderful year ahead. 🎉`
                : anniversaryYears > 0
                ? `Happy ${ordinal(anniversaryYears)} Work Anniversary, ${displayName}! Thank you for your dedication and contribution. 🎉`
                : roleGreetings[greetingIndex]}
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
