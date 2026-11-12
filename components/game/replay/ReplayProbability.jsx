// Win-probability summary (R31 stub; finished in W16 / R33). Uses only the
// frame's reached samples and current value — no invented initial 50%.

export default function ReplayProbability({ frame, teams }) {
  const { current, samples } = frame.probability;
  if (!current) return null;
  const home = Math.round(current.home * 100);
  return (
    <p className="mt-1 text-center text-xs text-subtle" data-samples={samples.length}>
      סיכויי ניצחון: {teams.home.nameHe || teams.home.abbreviation} <bdi dir="ltr">{home}%</bdi>
    </p>
  );
}
