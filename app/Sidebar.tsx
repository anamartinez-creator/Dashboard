"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = (d: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const UNITS = [
  {
    href: "/customer-success",
    label: "Customer Success",
    icon: icon(<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />),
  },
  {
    href: "/",
    label: "Service Delivery",
    icon: icon(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>),
  },
  {
    href: "/talent-acquisition",
    label: "Talent Acquisition",
    icon: icon(<><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M19 8v6M16 11h6" /></>),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="side">
      <div className="side-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/puzzle-logo-white.png" alt="Puzzle" width={178} height={39} />
      </div>
      <p className="side-label">Operations</p>
      <nav className="side-nav" aria-label="Business units">
        {UNITS.map((u) => (
          <Link key={u.href} href={u.href} className={`side-item${pathname === u.href ? " is-active" : ""}`} aria-current={pathname === u.href ? "page" : undefined}>
            {u.icon}
            <span>{u.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
