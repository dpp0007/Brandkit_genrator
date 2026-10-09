import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { brandPayload } from "@/lib/views";
import { Suspense } from "react";
import BrandView from "@/components/BrandView";

export const dynamic = "force-dynamic";
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([currentUser(), params]);
  if (!user) redirect("/auth");
  const initial = await brandPayload(user.id, id); // rendered with its data: no second round trip after the page loads
  return <Suspense><BrandView id={id} initial={initial} /></Suspense>;
}
