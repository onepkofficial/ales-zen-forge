import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** Live countdown to a draw date. Renders nothing when there is no date. */
export function Countdown({ target, className }: { target: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return <span className={className}>Draw closed</span>;

  const { d, h, m, s } = parts(diff);
  return (
    <span className={className} aria-label="Time remaining until draw">
      {d > 0 ? `${d}d ` : ""}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
