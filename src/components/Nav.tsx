"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "./Logo";

export default function Nav({ email }: { email: string | null }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const out = async () => { await fetch("/api/auth/signout", { method: "POST" }); setOpen(false); r.push("/"); r.refresh(); };
  const links = email ? [["Your brands", "/brands"], ["Settings", "/settings"]] : [];
  return (
    <header className="bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 md:px-12">
        <Link href="/" className="text-ink" aria-label="brandmeld home"><Logo /></Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([l, h]) => <Link key={h} href={h} className="text-[14px] font-semibold text-ink-soft hover:text-ink">{l}</Link>)}
          {email ? <button onClick={out} className="text-[14px] font-semibold text-ink-soft hover:text-ink">Sign out</button>
            : <><Link href="/auth" className="text-[14px] font-semibold text-ink-soft hover:text-ink">Sign in</Link><Link href="/auth?mode=signup" className="btn">Create account</Link></>}
        </nav>
        <button className="md:hidden text-[14px] font-semibold text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Menu"}</button>
      </div>
      {open && (
        <div className="md:hidden border-t border-hairline-soft px-6 py-3 flex flex-col">
          {links.map(([l, h]) => <Link key={h} href={h} onClick={() => setOpen(false)} className="py-3 text-[14px] font-semibold text-ink">{l}</Link>)}
          {email ? <button onClick={out} className="py-3 text-left text-[14px] font-semibold text-ink">Sign out</button>
            : <><Link href="/auth" onClick={() => setOpen(false)} className="py-3 text-[14px] font-semibold text-ink">Sign in</Link><Link href="/auth?mode=signup" onClick={() => setOpen(false)} className="btn mt-2">Create account</Link></>}
        </div>
      )}
    </header>
  );
}
