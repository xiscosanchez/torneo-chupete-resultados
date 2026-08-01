export function PlayerAvatar({
  url,
  nombre,
  apellidos,
  size = 48,
}: {
  url?: string | null;
  nombre: string;
  apellidos?: string | null;
  size?: number;
}) {
  const initials = `${nombre.charAt(0)}${(apellidos ?? "").charAt(0)}`.toUpperCase();

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${nombre} ${apellidos ?? ""}`}
        width={size}
        height={size}
        className="rounded-full object-cover bg-slate-200 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-green-100 text-green-800 flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}
