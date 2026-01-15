"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function GameCardSkeleton({ featured = false }) {
  return (
    <div className={featured ? "relative p-[2px] rounded-xl bg-gray-200" : ""}>
      <Card
        className={`overflow-hidden ${
          featured
            ? 'border-0 shadow-2xl bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50'
            : 'border border-gray-200 shadow-md bg-white'
        }`}
      >
        <CardContent className={`${featured ? 'p-6' : 'p-5'}`}>
          {/* Status badge skeleton */}
          <div className="flex items-center justify-between mb-4">
            <div className="w-16 h-6 rounded-full bg-gray-200 animate-shimmer" />
            {featured && <div className="w-24 h-6 rounded-full bg-gray-200 animate-shimmer" />}
          </div>

          {/* Teams and Scores skeleton */}
          <div className="space-y-3">
            {/* Away Team */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <div className={`${featured ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-gray-200 animate-shimmer`} />
                <div className="flex flex-col gap-1">
                  <div className={`${featured ? 'w-28 h-5' : 'w-24 h-4'} bg-gray-200 rounded animate-shimmer`} />
                  <div className="w-12 h-3 bg-gray-200 rounded animate-shimmer" />
                </div>
              </div>
              <div className={`${featured ? 'w-14 h-9' : 'w-12 h-7'} bg-gray-200 rounded animate-shimmer`} />
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center">
              <div className="h-px flex-1 bg-gray-200"></div>
              <div className="px-2 w-8 h-4 bg-gray-200 rounded animate-shimmer mx-2"></div>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>

            {/* Home Team */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <div className={`${featured ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-gray-200 animate-shimmer`} />
                <div className="flex flex-col gap-1">
                  <div className={`${featured ? 'w-28 h-5' : 'w-24 h-4'} bg-gray-200 rounded animate-shimmer`} />
                  <div className="w-12 h-3 bg-gray-200 rounded animate-shimmer" />
                </div>
              </div>
              <div className={`${featured ? 'w-14 h-9' : 'w-12 h-7'} bg-gray-200 rounded animate-shimmer`} />
            </div>
          </div>

          {/* Footer skeleton for featured */}
          {featured && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="w-32 h-4 bg-gray-200 rounded animate-shimmer mx-auto" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function GamesListSkeleton({ count = 3, featured = false }) {
  return (
    <div className={`grid gap-6 ${featured ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} featured={featured} />
      ))}
    </div>
  );
}
