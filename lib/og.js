// Helpers for generated share images (next/og). Its renderer, Satori, lays
// text out left to right with no bidi support, and only understands hex/rgb
// colors, so Hebrew strings and OKLCH team colors are converted here.

// Hebrew text in visual (left-to-right) order: runs of Latin letters/digits
// keep their order, everything else is reversed. Enough for short labels like
// team names ("76'רס") and "סיכומי NBA"; not a full bidi implementation.
export function visualRtl(text) {
  const runs = text.match(/[A-Za-z0-9][A-Za-z0-9.:/-]*|[^A-Za-z0-9]+/g) || [];
  return runs
    .reverse()
    .map((run) => (/^[A-Za-z0-9]/.test(run) ? run : [...run].reverse().join("")))
    .join("");
}

// "oklch(0.52 0.16 155)" → "#rrggbb"
export function oklchToHex(color) {
  const [l, c, h] = color.match(/[\d.]+/g).map(Number);
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    linear
      .map((v) => {
        const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

// Heebo (the site font) from Google Fonts, subset to `text`. Without a
// user agent, Google serves TrueType, which Satori can read.
export async function loadHeebo(text, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Heebo:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl, { next: { revalidate: 86400 * 30 } })).text();
  const fontUrl = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!fontUrl) throw new Error("Heebo font not found");
  return (await fetch(fontUrl, { next: { revalidate: 86400 * 30 } })).arrayBuffer();
}
