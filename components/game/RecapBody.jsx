"use client";

import { Fragment, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VideoEmbed from "./VideoEmbed";
import StatsSummary from "./StatsSummary";
import ScoreRail from "./ScoreRail";
import { getReadingMinutes, matchTablesToTeams } from "@/lib/recap";
import { matchupColors } from "@/utils/teamColors";
import { railMarks } from "@/utils/scoreRail";

const markdownComponents = {
  p: ({ children }) => <p className="mb-[18px] text-[17px] leading-[1.8] text-body">{children}</p>,
  strong: ({ children }) => <strong className="font-extrabold text-ink">{children}</strong>,
  h2: ({ children }) => <h2 className="mt-7 mb-2 text-lg font-extrabold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-extrabold">{children}</h3>,
  table: ({ children }) => (
    <div className="no-scrollbar my-6 overflow-x-auto rounded-xl border bg-surface" dir="ltr">
      <table className="w-full text-sm tabular-nums">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b px-3 py-2 text-left text-xs font-semibold text-subtle">{children}</th>,
  td: ({ children }) => <td className="border-b px-3 py-2 text-left">{children}</td>,
};

// Paragraph `n` of the text, tagged so the score rail can find it, and kept
// clear of the rail when there is one
const paragraphComponents = (n, rail) => ({
  ...markdownComponents,
  p: ({ children }) => (
    <p data-para={n} className={`mb-[18px] text-[17px] leading-[1.8] text-body ${rail ? "pe-12" : ""}`}>
      {children}
    </p>
  ),
});

// Where game photos go: spread across the first two thirds of the text.
function imageSlots(paragraphCount, imageCount) {
  if (paragraphCount <= 2 || imageCount === 0) return [];
  const range = Math.floor(paragraphCount * 0.67);
  if (imageCount === 1) return [Math.floor(range / 2)];
  return [Math.max(1, Math.floor(range / 3)), Math.max(2, Math.floor((range * 2) / 3))];
}

function GameImage({ image }) {
  return (
    <figure className="relative z-[1] -mx-4 my-6 bg-app lg:mx-0">
      <img src={image.url} alt={image.caption || ""} loading="lazy" className="aspect-video w-full bg-surface-2 object-cover lg:rounded-2xl" />
      {(image.caption || image.credit) && (
        <figcaption className="px-4 pt-1.5 text-xs text-faint lg:px-0">
          {image.caption}
          {image.credit && <span className="block">{image.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

// `media` ({ photos, videoId }) comes from the server with the page, so the
// photos and video are in place on first render.
export default function RecapBody({ game, recap, media }) {
  const images = media?.photos || [];

  const tables = matchTablesToTeams(game, recap.tables);
  // Each text block's paragraph number (-1 for tables), for placing the video and photos
  let count = -1;
  const paragraphOf = recap.blocks.map((b) => (b.type === "text" ? ++count : -1));
  const slots = imageSlots(count + 1, images.length);
  // Matched tables are shown once, as a summary, where the first table was
  const summaryAt = tables ? recap.blocks.findIndex((b) => b.type === "table") : -1;
  const colors = matchupColors(game.away_team, game.home_team);
  const marks = useMemo(
    () => railMarks(recap.blocks.filter((b) => b.type === "text").map((b) => b.text), game.story),
    [recap.blocks, game.story]
  );
  const rail = marks.length > 0;

  return (
    <article className="relative [&>p:first-of-type]:text-lg [&>p:first-of-type]:font-medium [&>p:first-of-type]:text-ink">
      <div className="mb-2.5 text-[12.5px] text-faint">{getReadingMinutes(game.content)} דק׳ קריאה</div>
      {recap.blocks.map((block, i) => {
        if (block.type === "table") {
          // Matched tables become one labeled summary; otherwise show them as-is.
          if (tables) return i === summaryAt ? <StatsSummary key={i} game={game} tables={tables} /> : null;
          const table = recap.tables[block.index];
          const markdown = [table.head, table.head.map(() => "---"), ...table.rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          );
        }

        const paragraph = paragraphOf[i];
        const imageIndex = slots.indexOf(paragraph);
        return (
          <Fragment key={i}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={paragraphComponents(paragraph, rail)}>
              {block.text}
            </ReactMarkdown>
            {paragraph === 0 && <VideoEmbed game={game} videoId={media?.videoId} colors={colors} />}
            {imageIndex >= 0 && images[imageIndex] && <GameImage image={images[imageIndex]} />}
          </Fragment>
        );
      })}
      {rail && <ScoreRail marks={marks} colors={colors} />}
    </article>
  );
}
