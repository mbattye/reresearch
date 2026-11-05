import { categoryShort } from "@/lib/topics";

// Stable hue per category so each field gets a recognisable "account" colour.
function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ category, size = 40 }: { category: string | null; size?: number }) {
  const label = categoryShort(category);
  const h = hue(category ?? "paper");
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * (label.length > 6 ? 0.2 : 0.27),
        background: `linear-gradient(135deg, hsl(${h} 55% 52%), hsl(${(h + 40) % 360} 60% 40%))`,
      }}
      aria-hidden
    >
      {label.length > 9 ? label.slice(0, 8) : label}
    </div>
  );
}
