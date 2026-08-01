import { BottomNav } from "@/components/BottomNav";
import { requireProfile } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireProfile();

  return (
    <div className="mx-auto max-w-lg min-h-dvh pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
