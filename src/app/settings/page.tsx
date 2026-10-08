import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { credentialStatus } from "@/lib/credentials";
import KeySettings from "@/components/KeySettings";

export const dynamic = "force-dynamic";
export default async function Settings() {
  const u = await currentUser();
  if (!u) redirect("/auth?next=/settings");
  const s = credentialStatus(u.id);
  return (
    <div className="mx-auto max-w-[760px] px-6 py-16 md:py-[96px]">
      <div className="eyebrow">Settings</div>
      <h1 className="display mt-3">Integrations</h1>
      <p className="mt-4">Signed in as {u.email}.</p>
      <KeySettings initial={s as any} />
    </div>
  );
}
