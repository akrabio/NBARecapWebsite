// A recap in the stored format (see README), Knicks at Spurs.
const table = (abbr, starters, bench, team) => `| TEAM | PTS | AST | REB | TO | +/- |
|---|---:|---:|---:|---:|---:|
| Starters (${abbr}) | ${starters} | 14 | 32 | 10 | -2 |
| Bench (${abbr}) | ${bench} | 4 | 14 | 3 | -18 |
| Team (${abbr}) | ${team} | 18 | 46 | 13 | -20 |
| Player ${abbr} | 32 | 5 | 5 | 5 | -9 |`;

export const recapContent = `**ניו יורק ניקס (53-29) 111 – 115 סן אנטוניו ספרס (62-20) | סדרה: 2-1**

סן אנטוניו ספרס ניצחה את ניו יורק ניקס 115–111 במשחק שלישי בסדרה, אחרי ערב גדול של ויקטור וומבניאמה.

הניקס פתחו חזק, אבל הספרס חזרו ברבע השלישי.

${table("NYK", 89, 22, 111)}

${table("SAS", 90, 25, 115)}`;

export const game = {
  id: "6a279cb6b248d9d4877bb9f1",
  date: "2026-06-08",
  home_team: "New York Knicks",
  away_team: "San Antonio Spurs",
  home_score: 111,
  away_score: 115,
  title: "**ניו יורק ניקס (53-29) 111 – 115 סן אנטוניו ספרס (62-20)",
  content: recapContent,
};
