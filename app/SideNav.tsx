"use client";

import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Daily Brief", icon: "◆" },
  { href: "/weekly", label: "Weekly", icon: "▤" },
  { href: "/seo", label: "SEO & Content", icon: "⌕" },
];

export default function SideNav() {
  const path = usePathname() || "/";
  return (
    <aside className="sidenav">
      <a href="/" className="sidenav-brand">
        <img src="/logo-avatar-dark.png" alt="" />
        <span>The Central</span>
      </a>
      <nav className="sidenav-links">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <a key={l.href} href={l.href} className={active ? "active" : ""}>
              <span className="ic">{l.icon}</span>
              <span>{l.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidenav-foot">Conversion intelligence</div>
    </aside>
  );
}
