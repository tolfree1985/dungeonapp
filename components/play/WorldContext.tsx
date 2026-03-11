"use client";

import { ui } from "@/lib/ui/classes";

type WorldContextProps = {
  location?: string;
  timeOfDay?: string;
  ambience?: string;
  tags?: string[];
};

export default function WorldContext({ location, timeOfDay, ambience, tags }: WorldContextProps) {
  const fallbackLocation = location ?? "Unknown location";
  const fallbackTime = timeOfDay ?? "Unknown time";
  const fallbackAmbience = ambience ?? "Stillness";

  return (
    <div className={`${ui.panel} p-5 bg-gradient-to-b from-[#11121c]/70 to-[#0c0e16]/80`}>
      <div className={ui.sectionLabel}>World</div>
      <div className="mt-4 space-y-3 text-sm text-[#d8d2c3]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#a59e90]">Location</span>
          <span className="font-medium text-[#f3efe6]">{fallbackLocation}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#a59e90]">Time</span>
          <span className="hud-chip text-[10px] border-white/20 bg-white/5 text-[#f3efe6]">{fallbackTime}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#a59e90]">Atmosphere</span>
          <span className="text-[#e3dbce]">{fallbackAmbience}</span>
        </div>
        {tags && tags.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-[#c9a35a]/80">Telemetry</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="hud-chip text-[#d8d2c3] bg-black/20 border-white/10">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
