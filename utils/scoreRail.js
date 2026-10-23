// The score rail beside a recap: the score at the end of each period, placed
// at the sentence where the text moves past it ("ברבע השני…" ends the first
// quarter, "…לרבע האחרון" ends the third). The text doesn't say exactly when
// things happened, so the scores only give a sense of the game at that point.
// Needs story.score (lib/story.js, version 2).
import { gameLength, STORY_STEP } from "@/lib/story";

const HALF = 1440;
const periodEnd = (k) => (k <= 4 ? k * 720 : gameLength(k));

// [pattern, period]: the period a sentence talks about. Longer phrases first.
const PERIODS = [
  [/רבע (?:ה)?ראשון/, 1],
  [/רבע (?:ה)?שני/, 2],
  [/רבע (?:ה)?שלישי/, 3],
  [/רבע (?:ה)?(?:רביעי|אחרון)/, 4],
  [/הארכה (?:ה)?שלישית/, 7],
  [/הארכה (?:ה)?שנייה/, 6],
  [/הארכה/, 5],
];
// "ברבע הבא": the period after the last one named
const NEXT_PERIOD = /רבע (?:ה)?בא/;
// "חותם את הרבע הראשון", "לקראת סיום הרבע": the period ends at this sentence
const ENDS = /(?:סיום|סוף|חות[םמ]|סוגר|מסיימ)\S*(?: את)? ?ה?$/;
const HALFTIME = /מחצית|הפסקה/;
// "ההפסקה הראשונה" is the break after the first quarter
const FIRST_BREAK = /הפסקה הראשונה/;
// "אחרי ההפסקה": the sentence starts after halftime
const AFTER_HALFTIME = /(?:(?:אחרי|לאחר|מאז) ה|מה)(?:מחצית|הפסקה)/;

// "ר1", "מחצית", "הארכה", "סיום"
export function railLabel(t, periods) {
  if (t >= gameLength(periods)) return "סיום";
  if (t === HALF) return "מחצית";
  if (t > 2880) return "הארכה";
  return `ר${Math.min(4, Math.floor(t / 720) + (t % 720 === 0 ? 0 : 1))}`;
}

// The score ([away, home]) at game time t
export function scoreAt(story, t) {
  const i = Math.min(story.score.length - 1, Math.max(0, Math.round(t / STORY_STEP)));
  return story.score[i];
}

// Sentences, and clauses after a comma that start with "ו", "אבל" or "אך"
// ("…סיום הרבע הראשון, וברבע השני…"), so a period can end mid-sentence
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|(?<=,)\s+(?=ו|אבל |אך )/).filter(Boolean);
// The end of a sentence as it reads on the page (no markdown), for finding it there
const needleOf = (sentence) => sentence.replace(/[*_`]/g, "").trim().slice(-24);

// Each period's end, as the index of the sentence it comes after
// (anchors[k] for the end of period k; undefined when the text doesn't say).
// A period's first mention ends the one before it at the previous sentence,
// or at its own sentence when the game goes into it ("לרבע האחרון"). A
// sentence that closes a period ("סיום הרבע השלישי") ends that period.
function periodAnchors(sentences, periods) {
  const anchors = [];
  const set = (k, index) => {
    if (k >= 1 && k < periods && anchors[k] == null) anchors[k] = index;
  };
  let current = 0;
  sentences.forEach(({ text }, index) => {
    const found = PERIODS.map(([pattern, period]) => [pattern.exec(text), period])
      .filter(([match, period]) => match && period <= Math.max(4, periods))
      // "הארכה" also matches inside "הארכה השנייה"
      .filter(([match, period], i, all) => !(period === 5 && all.some(([m, p]) => p > 5 && m.index === match.index)));
    const next = NEXT_PERIOD.exec(text);
    if (next && current) found.push([next, current + 1]);
    for (const [match, period] of found) {
      const before = text.slice(Math.max(0, match.index - 16), match.index);
      if (ENDS.test(before)) set(period, index);
      else set(period - 1, text[match.index - 1] === "ל" ? index : index - 1);
      current = Math.max(current, period);
    }
    if (FIRST_BREAK.test(text)) {
      set(1, index);
      current = Math.max(current, 1);
    } else if (HALFTIME.test(text)) set(2, AFTER_HALFTIME.test(text) ? index - 1 : index);
  });
  // Mentions that look back (earlier than an anchor before them) don't count
  let last = -1;
  for (let k = 1; k < periods; k++) {
    if (anchors[k] == null) continue;
    if (anchors[k] < last) anchors[k] = undefined;
    else last = anchors[k];
  }
  return anchors;
}

// One mark per period end: [{ para, needle, t, label, score }]. The text that
// tells the game runs from the first paragraph (after the summary) that names
// a period; the final score goes at the end of the paragraph that tells the
// last period. Period ends the text doesn't mark are spread between their
// neighbors. Without any mentions, the paragraphs after the summary are
// spread evenly over the game.
export function railMarks(paragraphs, story) {
  if (!story?.score?.length || paragraphs.length < 3) return [];
  const { periods } = story;

  // Every sentence after the summary paragraph
  const sentences = paragraphs.flatMap((text, para) => (para === 0 ? [] : sentencesOf(text).map((s) => ({ para, text: s }))));
  if (!sentences.length) return [];
  const lastOf = (para) => sentences.findLastIndex((s) => s.para === para);

  const anchors = periodAnchors(sentences, periods);
  const mentioned = sentences.findIndex(({ text }) => PERIODS.some(([pattern]) => pattern.test(text)) || HALFTIME.test(text));
  let start;
  if (mentioned === -1) {
    start = 0;
    anchors[periods] = sentences.length - 1;
  } else {
    start = sentences.findIndex((s) => s.para === sentences[mentioned].para);
    // The last period is told from the sentence after its start, to the end of that paragraph
    const lastStart = anchors[periods - 1];
    const told = lastStart != null ? Math.min(lastStart + 1, sentences.length - 1) : anchors.findLast((a) => a != null) ?? mentioned;
    anchors[periods] = lastOf(sentences[told].para);
  }

  // Fill in the period ends the text doesn't mark, evenly between neighbors
  let [from, fromIndex] = [0, start - 1];
  for (let k = 1; k <= periods; k++) {
    if (anchors[k] == null) continue;
    for (let j = from + 1; j < k; j++) anchors[j] = Math.round(fromIndex + ((anchors[k] - fromIndex) * (j - from)) / (k - from));
    [from, fromIndex] = [k, anchors[k]];
  }

  return anchors.slice(1).map((index, i) => {
    const k = i + 1;
    const sentence = sentences[Math.max(start, index)];
    const t = k === periods ? gameLength(periods) : periodEnd(k);
    return { para: sentence.para, needle: needleOf(sentence.text), t, label: railLabel(t, periods), score: scoreAt(story, t) };
  });
}
