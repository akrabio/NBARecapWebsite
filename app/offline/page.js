"use client";

import { Circle, WifiOff, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center" dir="rtl">
      {/* Decorative background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
      </div>

      <div className="text-center px-4">
        {/* Animated basketball with wifi-off icon */}
        <div className="w-32 h-32 mx-auto mb-8 relative">
          <motion.div
            className="w-32 h-32 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center shadow-lg"
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Circle className="w-16 h-16 text-orange-500" strokeWidth={3} />
          </motion.div>
          {/* Shadow that grows/shrinks with bounce */}
          <motion.div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-gray-300/50 rounded-full blur-sm"
            animate={{ scale: [1, 0.8, 1], opacity: [0.5, 0.3, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Wifi-off badge */}
          <div className="absolute -top-2 -right-2 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
            <WifiOff className="w-6 h-6 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          אתה במצב לא מקוון
        </h1>
        <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
          נראה שאין חיבור לאינטרנט. בדוק את החיבור שלך ונסה שוב.
        </p>

        <motion.button
          onClick={handleRetry}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
        >
          <RefreshCw className="w-5 h-5" />
          נסה שוב
        </motion.button>
      </div>
    </div>
  );
}
