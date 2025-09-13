import React from "react";
import { format, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function DatePicker({
  selectedDate,
  onDateChange,
  weekStart,
  onWeekChange,
}) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const goToPreviousWeek = () => {
    onWeekChange(addDays(weekStart, -7));
  };

  const goToNextWeek = () => {
    onWeekChange(addDays(weekStart, 7));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousWeek}
          className="hover:bg-blue-50 hover:border-blue-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <h2 className="text-lg font-semibold text-gray-800">
          {format(weekStart, "MMMM yyyy")}
        </h2>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          className="hover:bg-blue-50 hover:border-blue-200"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((date, index) => {
          const isSelected = isSameDay(date, selectedDate);
          const isTodayDate = isToday(date);

          return (
            <Button
              key={index}
              variant={isSelected ? "default" : "ghost"}
              onClick={() => onDateChange(date)}
              className={`h-16 flex flex-col justify-center items-center space-y-1 transition-all duration-200 ${
                isSelected
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg"
                  : isTodayDate
                  ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                  : "hover:bg-gray-50"
              }`}
            >
              <span className="text-xs font-medium uppercase tracking-wide">
                {format(date, "EEE")}
              </span>
              <span className="text-lg font-bold">{format(date, "d")}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
