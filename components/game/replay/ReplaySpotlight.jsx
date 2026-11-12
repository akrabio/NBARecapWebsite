// Key-moment spotlight (R31 stub; finished in W16 / R34). Shows the most
// recently reached moment's caption; its values come from
// `frame.spotlight.state` (snapshot at the moment), not the running state.

export function CaptionText({ caption }) {
  if (!caption) return null;
  return caption.parts.map((part, i) =>
    part.isolate ? (
      <bdi key={i} dir={part.dir || "auto"}>
        {part.value}
      </bdi>
    ) : (
      <span key={i}>{part.value}</span>
    ),
  );
}

export default function ReplaySpotlight({ frame }) {
  const { spotlight } = frame;
  const caption = spotlight?.highlight?.caption;
  return (
    <div className="mt-3 min-h-6 text-center text-sm" data-moment={spotlight?.momentIndex ?? undefined}>
      {caption && (
        <p className={spotlight.active ? "font-bold" : "text-subtle"}>
          <CaptionText caption={caption} />
        </p>
      )}
    </div>
  );
}
