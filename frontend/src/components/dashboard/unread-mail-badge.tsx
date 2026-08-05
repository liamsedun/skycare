"use client";

import { useEffect, useState } from "react";

export default function UnreadMailBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/mail/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (alive) setUnread(body.data?.unread ?? 0);
      } catch {
        /* ignore */
      }
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (unread === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white">
      {unread}
    </span>
  );
}