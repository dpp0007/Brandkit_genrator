import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Suspense } from "react";
import BrandView from "@/components/BrandView";

export const dynamic = "force-dynamic";
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) redirect("/auth");
  return <Suspense><BrandView id={(await params).id} /></Suspense>;
}
