"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, download, slug } from "@/lib/client";
import { useExplorer } from "./useExplorer";

type B = { id: string; name: string; url: string; favicon: string | null; updatedAt: string; versions: number; primary: string | null; tagline: string | null };
export default function BrandList({ initial }: { initial?: B[] }) {
  const [brands, setBrands] = useState<B[] | null>(initial ?? null);
  const [note, setNote] = useState("");
  const { start, error, dialog } = useExplorer();
  const load = async () => setBrands((await (await fetch("/api/brands")).json()).brands ?? []);
  useEffect(() => { if (!initial) load(); }, [initial]);

  const del = async (b: B) => { if (!confirm(`Delete ${b.name} and all its saved extractions?`)) return; await fetch(`/api/brands/${b.id}`, { method: "DELETE" }); load(); };
  const get = async (b: B) => (await fetch(`/api/brands/${b.id}`)).json();
  const copy = async (b: B) => { const j = await get(b); await navigator.clipboard.writeText(j.context.text); setNote(`Copied AI context for ${b.name}.`); };
  const exp = async (b: B) => { const j = await get(b); download(`${slug(b.name)}-brand-dna.json`, JSON.stringify(j.dna, null, 2)); };

  if (!brands) return <p className="mt-12 text-stone">Loading…</p>;
  if (!brands.length) return <div className="mt-12 border-t border-hairline-soft pt-8"><p>No brands yet. Explore a website and it will appear here.</p><Link href="/" className="btn mt-6">Explore a brand</Link></div>;
  return (
    <div className="mt-12 border-t border-hairline-soft">
      {(note || error) && <p className="py-3 text-[14px] text-ink" role="status">{note || error}</p>}
      {brands.map((b) => (
        <div key={b.id} className="flex flex-col gap-4 border-b border-hairline-soft py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="h-10 w-10 shrink-0 rounded-sm border border-hairline-soft" style={{ background: b.primary ?? "#eef0f2" }} aria-hidden />
            <div className="min-w-0">
              <Link href={`/brands/${b.id}`} className="h-sm block truncate hover:underline">{b.name}</Link>
              <div className="meta">{b.url.replace(/^https?:\/\//, "")} · Last analysed {ago(b.updatedAt)} · v{b.versions}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="link" href={`/brands/${b.id}`}>Open</Link>
            <button className="link" onClick={() => start(b.url, true)}>Re-run</button>
            <button className="link" onClick={() => copy(b)}>Copy context</button>
            <button className="link" onClick={() => exp(b)}>Export</button>
            <button className="link" onClick={() => del(b)}>Delete</button>
          </div>
        </div>
      ))}
      {dialog}
    </div>
  );
}
