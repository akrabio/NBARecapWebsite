import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function GameCard({ game, onClick }) {
  const winnerScore = Math.max(game.home_score || 0, game.away_score || 0);
  const homeWon = game.home_score >= game.away_score;
  const awayWon = game.away_score >= game.home_score;

const nbaEnToHe = {
  "Atlanta Hawks": "אטלנטה הוקס",
  "Boston Celtics": "בוסטון סלטיקס",
  "Brooklyn Nets": "ברוקלין נטס",
  "Charlotte Hornets": "שארלוט הורנטס",
  "Chicago Bulls": "שיקגו בולס",
  "Cleveland Cavaliers": "קליבלנד קאבלירס",
  "Dallas Mavericks": "דאלאס מאבריקס",
  "Denver Nuggets": "דנבר נאגטס",
  "Detroit Pistons": "דטרויט פיסטונס",
  "Golden State Warriors": "גולדן סטייט ווריורס",
  "Houston Rockets": "יוסטון רוקטס",
  "Indiana Pacers": "אינדיאנה פייסרס",
  "LA Clippers": "לוס אנג'לס קליפרס",
  "LA Lakers": "לוס אנג'לס לייקרס",
  "Memphis Grizzlies": "ממפיס גריזליס",
  "Miami Heat": "מיאמי היט",
  "Milwaukee Bucks": "מילווקי באקס",
  "Minnesota Timberwolves": "מינסוטה טימברוולבס",
  "New Orleans Pelicans": "ניו אורלינס פליקנס",
  "New York Knicks": "ניו יורק ניקס",
  "Oklahoma City Thunder": "אוקלהומה סיטי ת'אנדר",
  "Orlando Magic": "אורלנדו מג'יק",
  "Philadelphia 76ers": "פילדלפיה 76'רס",
  "Phoenix Suns": "פיניקס סאנס",
  "Portland Trail Blazers": "פורטלנד טרייל בלייזרס",
  "Sacramento Kings": "סקרמנטו קינגס",
  "San Antonio Spurs": "סן אנטוניו ספרס",
  "Toronto Raptors": "טורונטו ראפטורס",
  "Utah Jazz": "יוטה ג'אז",
  "Washington Wizards": "וושינגטון ויזארדס"
};

  console.log(game.home_team)
  console.log(game.away_team)

  const homeTeam = nbaEnToHe[game.home_team]
  const awayTeam = nbaEnToHe[game.away_team]

  // Helper function to get team logo URL (placeholder - replace with actual logo URLs)
  const getTeamLogo = (teamName) => {
    // Placeholder - you can replace this with actual logo URLs
    return `/logos/${teamName.toLowerCase().replace(/\s+/g, '-')}.png`;
  };

  return (
    <motion.div
      whileHover={{ y: -4, shadow: "0 10px 25px rgba(0,0,0,0.1)" }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className="cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-white to-gray-50"
        onClick={() => onClick(game)}
        dir="rtl"
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-start mb-4">
            <Badge
              variant={game.game_status === "final" ? "default" : "secondary"}
              className={`${
                game.game_status === "final"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {game.game_status === "final" ? (
                <>
                  <span>סיום</span>
                  <Trophy className="w-3 h-3 ml-1" />
                </>
              ) : (
                <>
                  <span>{game.game_status}</span>
                  <Clock className="w-3 h-3 ml-1" />
                </>
              )}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Away Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 space-x-reverse">
                <img
                  src={getTeamLogo(game.away_team)}
                  alt={`${awayTeam} logo`}
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    // Fallback to placeholder when image fails to load
                    e.target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500';
                    placeholder.textContent = awayTeam.substring(0, 2).toUpperCase();
                    e.target.parentNode.insertBefore(placeholder, e.target);
                  }}
                />
                <div className="text-lg font-bold text-gray-800">
                  {awayTeam}
                  
                </div>
              </div>
              <div
                className={`text-xl font-bold ${
                  awayWon ? "text-green-600" : "text-gray-600"
                }`}
              >
                {game.away_score || 0}
              </div>
            </div>

            {/* Divider */}
            <div className="border-b border-gray-200"></div>

            {/* Home Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 space-x-reverse">
                <img
                  src={getTeamLogo(game.home_team)}
                  alt={`${homeTeam} logo`}
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    // Fallback to placeholder when image fails to load
                    e.target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500';
                    placeholder.textContent = homeTeam.substring(0, 2).toUpperCase();
                    e.target.parentNode.insertBefore(placeholder, e.target);
                  }}
                />
                <div className="text-lg font-bold text-gray-800">
                  {homeTeam}
                </div>
                
              </div>
              <div
                className={`text-xl font-bold ${
                  homeWon ? "text-green-600" : "text-gray-600"
                }`}
              >
                {game.home_score || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}