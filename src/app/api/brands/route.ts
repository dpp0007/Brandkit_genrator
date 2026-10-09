import { handle, json, requireUser } from "@/lib/http";
import { brandList } from "@/lib/views";
export const GET = () => handle(async () => json({ brands: await brandList((await requireUser()).id) }));
