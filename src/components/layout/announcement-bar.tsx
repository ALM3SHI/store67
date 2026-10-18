/** Store-controlled announcements. Renders nothing when there's nothing true to say. */
export function AnnouncementBar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const sep = <span aria-hidden className="mx-6 inline-block h-1 w-1 rounded-full bg-field/70 align-middle" />;
  if (items.length <= 2) {
    return (
      <div className="bg-ink-2 text-[0.82rem] text-metal-100" data-testid="announcements">
        <p className="container-x flex min-h-9 flex-wrap items-center justify-center gap-y-1 py-1.5 text-center">
          {items.map((t, i) => (
            <span key={i}>
              {i > 0 ? sep : null}
              {t}
            </span>
          ))}
        </p>
      </div>
    );
  }
  const row = items.map((t, i) => (
    <span key={i} className="whitespace-nowrap">
      {t}
      {sep}
    </span>
  ));
  return (
    <div className="overflow-hidden bg-ink-2 text-[0.82rem] text-metal-100" data-testid="announcements">
      <div className="flex min-h-9 items-center py-1.5">
        <div className="marquee" aria-hidden>
          {row}
          {row}
        </div>
      </div>
      <ul className="sr-only">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
