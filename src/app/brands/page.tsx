import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { brandList } from "@/lib/views";
import BrandList from "@/components/BrandList";

export const dynamic = "force-dynamic";
export default async function Brands() {
  const user = await currentUser();
  if (!user) redirect("/auth?next=/brands");
  const initial = await brandList(user.id);
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-16 md:px-12 md:py-[96px]">
      <div className="eyebrow">History</div>
      <h1 className="display mt-3">Your Brands</h1>
      <BrandList initial={initial} />
    </div>
  );
}
