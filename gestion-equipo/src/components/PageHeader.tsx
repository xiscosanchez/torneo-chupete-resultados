import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  backHref,
  action,
}: {
  title: string;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-stone-900 text-white px-4 py-3 flex items-center gap-2 shadow">
      {backHref && (
        <Link href={backHref} className="-ml-2 p-1 rounded-full active:bg-stone-700">
          <ChevronLeft size={24} />
        </Link>
      )}
      <h1 className="text-lg font-extrabold flex-1 truncate text-amber-400">{title}</h1>
      {action}
    </header>
  );
}
