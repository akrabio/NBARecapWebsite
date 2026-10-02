"use client";

import { Fragment, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VideoEmbed from "./VideoEmbed";
import StatsSummary from "./StatsSummary";
import { getReadingMinutes, matchTablesToTeams } from "@/lib/recap";
import { getTeamColors } from "@/utils/teamColors";

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

// Where game photos go: spread across the first two thirds of the text.
function imageSlots(paragraphCount, imageCount) {
  if (paragraphCount <= 2 || imageCount === 0) return [];
  const range = Math.floor(paragraphCount * 0.67);
  if (imageCount === 1) return [Math.floor(range / 2)];
  return [Math.max(1, Math.floor(range / 3)), Math.max(2, Math.floor((range * 2) / 3))];
}

function GameImage({ image }) {
  return (
    <figure className="-mx-4 my-6 lg:mx-0">
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

export default function RecapBody({ game, recap }) {
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (!game.espn_game_id) return;
    let cancelled = false;
    fetch(`/api/game-images/${game.espn_game_id}`)
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((data) => !cancelled && setImages(data.images || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game.espn_game_id]);

  const tables = matchTablesToTeams(game, recap.tables);
  const paragraphCount = recap.blocks.filter((b) => b.type === "text").length;
  const slots = imageSlots(paragraphCount, images.length);
  const colors = { away: getTeamColors(game.away_team).primary, home: getTeamColors(game.home_team).primary };

  let paragraph = -1;
  let statsShown = false;

  return (
    <article className="[&>p:first-of-type]:text-lg [&>p:first-of-type]:font-medium [&>p:first-of-type]:text-ink">
      <div className="mb-2.5 text-[12.5px] text-faint">{getReadingMinutes(game.content)} דק׳ קריאה</div>
      {recap.blocks.map((block, i) => {
        if (block.type === "table") {
          // Matched tables become one labeled summary; otherwise show them as-is.
          if (tables) {
            if (statsShown) return null;
            statsShown = true;
            return <StatsSummary key={i} game={game} tables={tables} />;
          }
          const table = recap.tables[block.index];
          const markdown = [table.head, table.head.map(() => "---"), ...table.rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          );
        }

        paragraph += 1;
        const imageIndex = slots.indexOf(paragraph);
        return (
          <Fragment key={i}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {block.text}
            </ReactMarkdown>
            {paragraph === 0 && <VideoEmbed game={game} colors={colors} />}
            {imageIndex >= 0 && images[imageIndex] && <GameImage image={images[imageIndex]} />}
          </Fragment>
        );
      })}
    </article>
  );
}
