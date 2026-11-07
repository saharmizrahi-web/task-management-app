import { loadAll } from "@/lib/store";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const initial = await loadAll();
  return <Shell initial={initial}>{children}</Shell>;
}
