import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import BrandList from "@/components/BrandList";

export const dynamic = "force-dynamic";
export default async function Brands() {
  if (!(await currentUser())) redirect("/auth?next=/brands");
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-16 md:px-12 md:py-[96px]">
      <div className="eyebrow">History</div>
      <h1 className="display mt-3">Your Brands</h1>
      <BrandList />
    </div>
  );
}
