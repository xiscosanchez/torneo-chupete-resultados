"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  BarChart3,
  User,
  Users,
} from "lucide-react";

const ITEMS = [
  { href: "/plantilla", label: "Plantilla", icon: Users },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/convocatorias", label: "Convocat.", icon: ClipboardList },
  { href: "/estadisticas", label: "Stats", icon: BarChart3 },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-safe">
      <div className="mx-auto max-w-lg grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(href + "/") ||
            (href === "/calendario" && pathname.startsWith("/partidos"));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                active ? "text-amber-700" : "text-slate-400"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
