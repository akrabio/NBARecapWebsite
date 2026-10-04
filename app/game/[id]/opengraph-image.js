// Share image for a game (WhatsApp/X/Facebook previews): both teams, the
// final score and the date, styled like the game page's score header.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getGameById } from "@/lib/games";
import { loadHeebo, oklchToHex, visualRtl } from "@/lib/og";
import { DARK_LOGOS, nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { extractSeriesRecord, formatScore, getTeamLogoUrl, getWinner } from "@/utils/gameUtils";
import { getGameReason } from "@/utils/gameScoring";
import { getTeamColors } from "@/utils/teamColors";

export const alt = "תוצאת המשחק";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0d12";
const INK = "#eef1f6";
const DIM = "#5d6576";
const SUBTLE = "#a3abbc";
const BRAND = "#ff7a1a";

const shortName = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

async function logoDataUrl(team) {
  try {
    const file = await readFile(join(process.cwd(), "public", getTeamLogoUrl(team)));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

function Team({ team, logo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 340 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 220,
          height: 220,
          borderRadius: 999,
          // Black logos get a light backing, like on the site's dark theme
          background: DARK_LOGOS.has(team) ? "#e9ecf1" : "transparent",
        }}
      >
        {logo && <img alt="" src={logo} width={DARK_LOGOS.has(team) ? 180 : 210} height={DARK_LOGOS.has(team) ? 180 : 210} />}
      </div>
      <div style={{ marginTop: 22, fontSize: 54, fontWeight: 800, color: INK }}>{visualRtl(shortName(team))}</div>
    </div>
  );
}

export default async function Image({ params }) {
  const { id } = await params;
  const game = await getGameById(id);

  // Unknown game: a plain branded card
  if (!game) {
    const brand = visualRtl("סיכומי NBA בעברית");
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: BG }}>
          <div style={{ fontSize: 80, fontWeight: 800, color: BRAND }}>{brand}</div>
        </div>
      ),
      { ...size, fonts: [{ name: "Heebo", data: await loadHeebo(brand, 800), weight: 800 }] }
    );
  }

  const winner = getWinner(game);
  const series = extractSeriesRecord(game.content);
  const reason = getGameReason(game);
  const tag = series ? `סדרה ${series}` : reason?.label;
  const [y, m, d] = game.date.split("-").map(Number);
  const date = `${d}.${m}.${y}`;
  const brand = visualRtl("סיכומי NBA");
  const tagText = tag ? visualRtl(tag) : null;
  const awayColor = oklchToHex(getTeamColors(game.away_team).primary);
  const homeColor = oklchToHex(getTeamColors(game.home_team).primary);

  const [awayLogo, homeLogo, font] = await Promise.all([
    logoDataUrl(game.away_team),
    logoDataUrl(game.home_team),
    // Subset to the characters actually drawn
    loadHeebo(
      [brand, date, tagText, shortName(game.away_team), shortName(game.home_team), "0123456789–"].join(""),
      800
    ),
  ]);

  const score = (side) => (
    <span style={{ color: winner && winner !== side ? DIM : INK }}>{formatScore(game[`${side}_score`])}</span>
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "44px 56px",
          background: BG,
          // Each team's color behind its side: home on the left, away on the
          // right (the page reads right to left)
          backgroundImage: `linear-gradient(100deg, ${homeColor}66 0%, ${BG} 42%, ${BG} 58%, ${awayColor}66 100%)`,
          fontFamily: "Heebo",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 32, fontWeight: 800 }}>
          <span style={{ color: SUBTLE }}>{date}</span>
          <span style={{ color: BRAND }}>{brand}</span>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Team team={game.home_team} logo={homeLogo} />
          <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 150, fontWeight: 800, letterSpacing: -4 }}>
            {score("home")}
            <span style={{ fontSize: 80, color: DIM }}>–</span>
            {score("away")}
          </div>
          <Team team={game.away_team} logo={awayLogo} />
        </div>

        <div style={{ display: "flex", justifyContent: "center", height: 56 }}>
          {tagText && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 26px",
                borderRadius: 999,
                fontSize: 30,
                fontWeight: 800,
                color: BRAND,
                background: "rgba(255, 122, 26, 0.16)",
              }}
            >
              {tagText}
            </span>
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Heebo", data: font, weight: 800 }],
      // A finished game's image never changes; let the CDN keep it. (Shorter
      // while the score is missing, in case it gets filled in.)
      headers: { "Cache-Control": `public, s-maxage=${winner ? 2592000 : 3600}, stale-while-revalidate=86400` },
    }
  );
}
