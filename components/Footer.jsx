"use client";


export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white mt-20" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold">סיכומי NBA בעברית</h3>
          </div>
          <p className="text-gray-400 text-sm text-center">
            ניתוח מקצועי ומעמיק של משחקי NBA
          </p>

          {/* Social Links */}
          <a
            href="https://x.com/NRecaps84077"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all group"
          >
            <img src="icons/x.svg" className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">עקבו אחרינו ב-X</span>
          </a>

          <div className="h-px w-32 bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} כל הזכויות שמורות
          </p>
        </div>
      </div>
    </footer>
  );
}
