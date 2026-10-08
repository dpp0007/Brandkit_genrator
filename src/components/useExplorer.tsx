"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import KeyDialog, { Provider } from "./KeyDialog";

// Starts an exploration. Opens the key dialog only when the backend reports no (or an invalid) saved key.
export function useExplorer() {
  const r = useRouter();
  const pending = useRef<{ url: string; refresh: boolean } | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; invalid: boolean; provider: Provider }>({ open: false, invalid: false, provider: "tinyfish" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (url: string, refresh = false) => {
    setError(""); setBusy(true);
    pending.current = { url, refresh };
    try {
      const res = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, refresh }) });
      const j = await res.json();
      if (res.ok) return r.push(`/explore/${j.jobId}?refresh=${refresh ? 1 : 0}`);
      const code = j.error?.code;
      if (code === "UNAUTHENTICATED") return r.push(`/auth?mode=signup&next=${encodeURIComponent("/?url=" + encodeURIComponent(url))}`);
      if (code === "NO_KEY") return setDialog({ open: true, invalid: false, provider: j.error.provider ?? "tinyfish" });
      if (code === "INVALID_KEY") return setDialog({ open: true, invalid: true, provider: j.error.provider ?? "tinyfish" });
      setError(j.error?.message ?? "Something went wrong.");
    } finally { setBusy(false); }
  };
  const node = (
    <KeyDialog open={dialog.open} provider={dialog.provider} invalid={dialog.invalid} onClose={() => setDialog({ ...dialog, open: false })}
      onConnected={() => { setDialog({ ...dialog, open: false }); if (pending.current) start(pending.current.url, pending.current.refresh); }} />
  );
  return { start, busy, error, dialog: node };
}
