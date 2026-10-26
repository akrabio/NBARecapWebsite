import { describe, expect, it } from "vitest";
import { parseRecap } from "@/lib/recap";
import { railLabel, railMarks, scoreAt } from "@/utils/scoreRail";

// A regulation game where the away team scores a point every 30 seconds and
// the home team every minute: score[i] = [i, floor(i / 2)]
const story = { periods: 4, score: Array.from({ length: 97 }, (_, i) => [i, Math.floor(i / 2)]) };

const paragraphs = [
  "פילדלפיה הופכת ומנצחת 114–106.",
  "קליבלנד בורחת ברבע הראשון. ברבע השני היתרון תופח. שלשה עם הבאזר להפסקה מספקת סימן חיים, אבל השינוי מגיע אחריה.",
  "ברבע האחרון אמביד משלים את המהפך. בראון סוגר עניין.",
  "מיטשל מסיים עם 32 נקודות. ברבע הראשון הוא קלע 12.",
];
describe("scoreAt", () => {
  it("reads the score at a game time", () => {
    expect(scoreAt(story, 0)).toEqual([0, 0]);
    expect(scoreAt(story, 720)).toEqual([24, 12]);
    expect(scoreAt(story, 99999)).toEqual([96, 48]);
  });
});

describe("railLabel", () => {
  it("names the stage of the game", () => {
    expect(railLabel(720, 4)).toBe("ר1");
    expect(railLabel(1440, 4)).toBe("מחצית");
    expect(railLabel(2520, 4)).toBe("ר4");
    expect(railLabel(2880, 5)).toBe("ר4");
    expect(railLabel(3030, 5)).toBe("הארכה");
    expect(railLabel(2880, 4)).toBe("סיום");
  });
});

describe("railMarks", () => {
  // A mark's needle is the last 24 characters of its sentence
  const where = (marks) => marks.map((m) => [m.label, m.para, m.needle]);
  const end = (sentence) => sentence.slice(-24);

  it("puts each period's end where the text moves past it, and the final score after the last period", () => {
    const marks = railMarks(paragraphs, story);
    expect(where(marks)).toEqual([
      ["ר1", 1, end("קליבלנד בורחת ברבע הראשון.")],
      ["מחצית", 1, end("שלשה עם הבאזר להפסקה מספקת סימן חיים,")],
      ["ר3", 1, end("אבל השינוי מגיע אחריה.")],
      ["סיום", 2, end("בראון סוגר עניין.")],
    ]);
    expect(marks.map((m) => m.score)).toEqual([
      [24, 12],
      [48, 24],
      [72, 36],
      [96, 48],
    ]);
  });

  it("reads a period that closes ('סיום הרבע') and one the game goes into ('לרבע האחרון')", () => {
    const text = [
      "סיכום.",
      "יוסטון מצמצמת לפני סיום הרבע הראשון, וברבע השני דאלאס בורחת.",
      "דאלאס יורדת להפסקה ביתרון.",
      "שלשה עם הבאזר שולחת את יוסטון לרבע האחרון. משם יוסטון לא משחררת.",
      "שנגון מסיים עם 30 נקודות.",
    ];
    expect(where(railMarks(text, story)).map(([label, para]) => [label, para])).toEqual([
      ["ר1", 1],
      ["מחצית", 2],
      ["ר3", 3],
      ["סיום", 3],
    ]);
    expect(railMarks(text, story)[0].needle).toBe(end("יוסטון מצמצמת לפני סיום הרבע הראשון,"));
  });

  it("ends on the paragraph after a period the game goes into at a paragraph's end", () => {
    const text = ["סיכום.", "ברבע השני דנבר בורחת. הארטנשטיין חותם את המחצית.", "אחרי ההפסקה המשחק מתהפך ושולח את המארחת לרבע האחרון.", "משם אוקלהומה לא משחררת.", "יוקיץ' קולע 13."];
    expect(railMarks(text, story).map((m) => [m.label, m.para])).toEqual([
      ["ר1", 1],
      ["מחצית", 1],
      ["ר3", 2],
      ["סיום", 3],
    ]);
  });

  it("knows ההפסקה הראשונה and ברבע הבא", () => {
    const text = ["סיכום.", "יוטה פותחת טוב עד ההפסקה הראשונה. ברבע הבא ממפיס הופכת.", "אחרי ההפסקה ממפיס לוחצת.", "ברבע האחרון יוטה מנסה. ממפיס סוגרת.", "ג'ורג' קולע 22."];
    expect(railMarks(text, story).map((m) => [m.label, m.para])).toEqual([
      ["ר1", 1],
      ["מחצית", 1],
      ["ר3", 2],
      ["סיום", 3],
    ]);
  });

  it("skips the summary paragraph and mentions that look back", () => {
    const marks = railMarks(paragraphs, story);
    expect(marks.some((m) => m.para === 0 || m.para === 3)).toBe(false);
  });

  it("skips every chunk of a long intro before placing later period scores", () => {
    const intro = `${Array(45).fill("לוקה").join(" ")}. ברבע האחרון ${Array(18).fill("נקודות").join(" ")}.`;
    const content = [
      intro,
      "יוטה פותחת ברבע הראשון. ברבע השני הלייקרס חוזרים. לפני ההפסקה הם מובילים.",
      "אחרי ההפסקה המשחק צמוד. דונצ'יץ' חותם את הרבע השלישי. ברבע האחרון הלייקרס מנצחים. יוטה לא חוזרת.",
    ].join("\n\n");
    const textBlocks = parseRecap(content).blocks.filter((block) => block.type === "text");
    expect(textBlocks.map((block) => block.intro)).toEqual([true, true, false, false]);

    const marks = railMarks(textBlocks.map((block) => block.text), story, textBlocks.filter((block) => block.intro).length);
    expect(marks.map((mark) => mark.para)).toEqual([2, 2, 3, 3]);
  });

  it("spreads the period ends over the text when it names no period", () => {
    const marks = railMarks(["סיכום.", "פסקה.", "עוד פסקה.", "סוף."], story);
    expect(marks.map((m) => [m.label, m.para])).toEqual([
      ["ר1", 1],
      ["מחצית", 2],
      ["ר3", 2],
      ["סיום", 3],
    ]);
  });

  it("marks the end of regulation and each overtime", () => {
    const ot = { periods: 5, score: Array.from({ length: 107 }, () => [0, 0]) };
    const text = ["סיכום.", "ברבע השני הם ברחו.", "ברבע השלישי הם התקרבו.", "ברבע האחרון הם השוו.", "בהארכה הם ניצחו.", "סטטיסטיקה."];
    expect(railMarks(text, ot).map((m) => [m.label, m.para])).toEqual([
      ["ר1", 1],
      ["מחצית", 1],
      ["ר3", 2],
      ["ר4", 3],
      ["סיום", 4],
    ]);
  });

  it("needs the score and enough text", () => {
    expect(railMarks(paragraphs, { periods: 4, score: null })).toEqual([]);
    expect(railMarks(paragraphs.slice(0, 2), story)).toEqual([]);
  });
});
