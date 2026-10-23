"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Chips closer than this would overlap, so later ones are pushed down
const CHIP_GAP = 56;

// The line where `needle` ends in the element's text, or null
function needleRect(element, needle) {
  const nodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  const text = nodes.map((node) => node.data).join("");
  const found = text.indexOf(needle);
  if (found === -1) return null;
  let offset = found + needle.length - 1;
  for (const node of nodes) {
    if (offset < node.data.length) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      return range.getClientRects()[0] || null;
    }
    offset -= node.data.length;
  }
  return null;
}

// Each mark's height in the container: beside the line where its sentence
// ends, or the paragraph's last line. Paragraphs carry data-para (see RecapBody).
function measure(container, marks) {
  const top = container.getBoundingClientRect().top;
  let previous = -Infinity;
  return marks.map((mark) => {
    const paragraph = container.querySelector(`[data-para="${mark.para}"]`);
    if (!paragraph) return null;
    const rect = needleRect(paragraph, mark.needle);
    const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight) || 30;
    const y = (rect ? rect.top + rect.height / 2 : paragraph.getBoundingClientRect().bottom - lineHeight / 2) - top;
    previous = Math.max(y, previous + CHIP_GAP);
    return previous;
  });
}

function Score({ value, other, color }) {
  return (
    <span className="flex items-center gap-1">
      <i className="block h-2.5 w-[3px] rounded-full" style={{ background: color }} />
      <span className={value > other ? "font-extrabold text-ink" : "text-subtle"}>{value}</span>
    </span>
  );
}

// The score beside the recap at the points the text reaches (see
// utils/scoreRail.js), where the text moves past each period. Sits in the space
// RecapBody leaves beside the paragraphs, measuring against its parent (the
// article); draws nothing until it has measured the text.
export default function ScoreRail({ marks, colors }) {
  const ref = useRef(null);
  const [ys, setYs] = useState(null);

  useLayoutEffect(() => {
    const container = ref.current?.parentElement;
    if (!container || !marks.length) return;
    const update = () => setYs(measure(container, marks));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [marks]);

  const placed = ys ? marks.map((mark, i) => ({ ...mark, y: ys[i] })).filter((m) => m.y != null) : [];

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-0 w-11">
      {placed.length > 0 && (
        <span
          className="absolute end-[21px] w-0.5 rounded-full bg-line"
          style={{ top: placed[0].y, height: placed.at(-1).y - placed[0].y }}
        />
      )}
      {placed.map(({ t, y, label, score: [away, home] }) => (
        <div key={t} className="absolute inset-x-0 flex -translate-y-1/2 flex-col items-center" style={{ top: y }}>
          <span className="mb-0.5 rounded bg-app px-0.5 text-[10px] leading-none font-semibold text-faint">{label}</span>
          <span className="grid gap-px rounded-lg border bg-surface px-1.5 py-1 text-[12px] leading-tight tabular-nums">
            <Score value={away} other={home} color={colors.away} />
            <Score value={home} other={away} color={colors.home} />
          </span>
        </div>
      ))}
    </div>
  );
}
