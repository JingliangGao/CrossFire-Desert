import type { HudState } from "../game/fps";
import { WEAPON_NAMES } from "../game/fps";

export const PLAYER_NAME = "丶火线新兵";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

import { memo } from "react";

/** the town footprint never changes at runtime — keep it out of the HUD re-renders */
const MapLayer = memo(function MapLayer({ shapes }: { shapes: { x: number; z: number; w: number; d: number }[] }) {
  return (
    <g>
      {shapes.map((s, i) => (
        <rect
          key={i}
          x={s.x - s.w / 2}
          y={s.z - s.d / 2}
          width={s.w}
          height={s.d}
          fill="rgba(126,224,138,0.14)"
          stroke="rgba(126,224,138,0.4)"
          strokeWidth="0.6"
        />
      ))}
      <text x="52" y="-52" fill="rgba(255,176,32,0.85)" fontSize="13" fontFamily="Rajdhani" fontWeight="700">
        A
      </text>
      <text x="-58" y="-52" fill="rgba(255,176,32,0.85)" fontSize="13" fontFamily="Rajdhani" fontWeight="700">
        B
      </text>
    </g>
  );
});

/** top-centre circular radar: north-up map, player arrow, contact blips */
function Radar({ hud, shapes }: { hud: HudState; shapes: { x: number; z: number; w: number; d: number }[] }) {
  const R = 74;
  return (
    <svg viewBox="-82 -82 164 164" className="h-[108px] w-[108px] sm:h-[132px] sm:w-[132px]">
      <defs>
        <clipPath id="rclip">
          <circle cx="0" cy="0" r="74" />
        </clipPath>
        <radialGradient id="rbg" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(24,42,28,0.82)" />
          <stop offset="100%" stopColor="rgba(8,14,10,0.88)" />
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r={R} fill="url(#rbg)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <g clipPath="url(#rclip)">
        <MapLayer shapes={shapes} />
        {hud.radar.dots.map((_, i) =>
          i % 2 === 0 ? (
            <g key={i}>
              <circle cx={hud.radar.dots[i]} cy={hud.radar.dots[i + 1]} r="3.4" fill="#E23A2E" />
              <circle cx={hud.radar.dots[i]} cy={hud.radar.dots[i + 1]} r="6" fill="none" stroke="rgba(226,58,46,0.5)" strokeWidth="0.8" />
            </g>
          ) : null,
        )}
        {hud.radar.aliens.map((_, i) =>
          i % 2 === 0 ? (
            <circle key={`a${i}`} cx={hud.radar.aliens[i]} cy={hud.radar.aliens[i + 1]} r="3.2" fill="#39FFE0" />
          ) : null,
        )}
        <g transform={`translate(${hud.radar.px} ${hud.radar.pz}) rotate(${(-hud.radar.yaw * 180) / Math.PI})`}>
          <path d="M0 -7 L5 6 L0 2.5 L-5 6 Z" fill="#EAF3E6" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
        </g>
      </g>
      <circle cx="0" cy="0" r="3" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
    </svg>
  );
}

/** enemy nameplates, projected by the engine into screen fractions */
function Markers({ hud }: { hud: HudState }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hud.markers.map((m, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
        >
          <div className="flex flex-col items-center gap-[2px]">
            <div
              className="px-1.5 py-[1px] text-[10px] leading-[13px] font-medium whitespace-nowrap"
              style={{
                background: "rgba(8,12,9,0.6)",
                border: m.alien ? "1px solid rgba(80,255,220,0.7)" : "1px solid rgba(255,90,70,0.5)",
                color: m.alien ? "#9DFFF0" : "#FF9A8C",
              }}
            >
              {m.name}
            </div>
            <div className="h-[3px] w-[42px] bg-black/55">
              <div
                className="h-full"
                style={{
                  width: `${m.hp}%`,
                  background: m.alien ? "#39FFE0" : m.hp > 50 ? "#E23A2E" : "#FFB020",
                }}
              />
            </div>
            <div
              className="h-[6px] w-[6px] rotate-45"
              style={{ background: "rgba(226,58,46,0.9)", boxShadow: "0 0 6px rgba(226,58,46,0.8)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Hud({ hud, shapes }: { hud: HudState; shapes: { x: number; z: number; w: number; d: number }[] }) {
  const hpPct = Math.max(0, Math.min(1, hud.hp / 100));
  const arPct = Math.max(0, Math.min(1, hud.armor / 100));
  const low = hud.ammo <= Math.max(2, 0.25 * 30);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <Markers hud={hud} />
      {/* ── top: score plate + radar + timer */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-center gap-3 px-2 pt-2 sm:gap-6 sm:pt-3">
        <div className="panel mt-3 flex items-center gap-3 px-3 py-1.5 sm:mt-5 sm:px-5">
          <div>
            <div className="label text-[8px] text-white/45 sm:text-[9px]">击杀</div>
            <div className="num hud-glow text-[24px] leading-none text-white sm:text-[30px]">
              {String(hud.kills).padStart(3, "0")}
            </div>
          </div>
          <div className="h-7 w-px bg-white/15" />
          <div>
            <div className="label text-[8px] text-white/45 sm:text-[9px]">爆头</div>
            <div className="num text-[18px] leading-none text-[#FFB020] sm:text-[22px]">
              {String(hud.headshots).padStart(2, "0")}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Radar hud={hud} shapes={shapes} />
          <div className="panel -mt-1 flex items-center gap-3 px-3 py-0.5">
            <span className="num text-[15px] leading-tight text-white/90 sm:text-[17px]">{fmt(hud.time)}</span>
            <span className="text-[9px] tracking-[0.24em] text-white/40">波次 {hud.wave}</span>
            <span className="text-[9px] tracking-[0.24em] text-[#E23A2E]">敌 {hud.alive}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-white/45">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: hud.net === "ws" ? "#39FFE0" : hud.net === "local" ? "#FFB020" : "#E23A2E" }}
            />
            {hud.net === "ws" ? "联机中" : hud.net === "local" ? "本机联机" : "单机"} · 队友 {hud.peers}
          </div>
          {hud.alert && (
            <div className="mt-1 bg-[#E23A2E] px-3 py-1 text-[11px] font-black tracking-[0.28em] text-[#FFE9C8]">
              {hud.alert}
            </div>
          )}
        </div>

        <div className="panel mt-3 hidden px-4 py-1.5 sm:mt-5 sm:block">
          <div className="label text-[9px] text-white/45">得分</div>
          <div className="num text-[26px] leading-none text-[#FFB020]">{String(hud.score).padStart(5, "0")}</div>
        </div>
      </div>

      {/* ── kill feed */}
      <div className="absolute top-24 right-2 flex w-[188px] flex-col items-end gap-1 sm:top-28 sm:right-4 sm:w-[248px]">
        {hud.feed.map((f) => (
          <div
            key={f.id}
            className="feed-in panel flex items-center gap-1.5 px-2 py-1 text-[10px] sm:text-[11px]"
          >
            <span className="text-[#8ED6FF]">{PLAYER_NAME}</span>
            <span className="text-white/35">▸</span>
            <span className="num text-white/85">{f.gun}</span>
            {f.head && <span className="bg-[#FFB020] px-1 text-[9px] font-black text-[#241505]">爆头</span>}
            <span className="text-white/35">▸</span>
            <span className="text-[#FF7A6B]">{f.name}</span>
          </div>
        ))}
      </div>

      {/* ── streak banner */}
      {hud.streak >= 2 && (
        <div className="pulse-red absolute inset-x-0 top-1/2 mt-[-120px] text-center">
          <div className="num text-[26px] leading-none text-[#FFB020] hud-glow">×{hud.streak} 连杀</div>
        </div>
      )}

      {/* ── bottom left: health / armor */}
      <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4">
        <div className="panel px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex items-end gap-2">
            <span className="label mb-1.5 text-[8px] text-white/45 sm:text-[9px]">生命</span>
            <span
              className={`num hud-glow text-[34px] leading-none sm:text-[44px] ${hud.hp <= 30 ? "text-[#E23A2E]" : "text-white"}`}
            >
              {String(hud.hp).padStart(3, "0")}
            </span>
          </div>
          <div className="mt-1 h-[5px] w-[132px] bg-white/12 sm:w-[168px]">
            <div
              className="h-full transition-[width] duration-150"
              style={{ width: `${hpPct * 100}%`, background: "linear-gradient(90deg,#7a1610,#E23A2E)" }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="label text-[8px] text-white/45 sm:text-[9px]">护甲</span>
            <div className="h-[4px] w-[92px] bg-white/12 sm:w-[120px]">
              <div
                className="h-full transition-[width] duration-150"
                style={{ width: `${arPct * 100}%`, background: "linear-gradient(90deg,#1c4f74,#3FA9F5)" }}
              />
            </div>
            <span className="num text-[13px] text-[#3FA9F5]">{hud.armor}</span>
          </div>
        </div>
      </div>

      {/* ── bottom right: weapon + ammo */}
      <div className="absolute right-2 bottom-2 sm:right-4 sm:bottom-4">
        <div className="panel px-3 py-2 text-right sm:px-4 sm:py-2.5">
          <div className="label text-[8px] text-white/45 sm:text-[9px]">武器</div>
          <div className="num text-[18px] leading-tight text-white/95 sm:text-[22px]">{hud.weapon}</div>
          <div className="mt-0.5 flex items-end justify-end gap-1">
            <span
              className={`num hud-glow text-[38px] leading-none sm:text-[48px] ${low ? "text-[#E23A2E]" : "text-white"}`}
            >
              {String(hud.ammo).padStart(2, "0")}
            </span>
            <span className="num mb-1 text-[18px] leading-none text-white/45 sm:text-[22px]">
              /{String(hud.reserve).padStart(2, "0")}
            </span>
          </div>
          {hud.reloading > 0 ? (
            <div className="mt-1 h-[4px] w-[150px] bg-white/12 sm:w-[180px]">
              <div className="h-full bg-[#FFB020]" style={{ width: `${hud.reloading * 100}%` }} />
            </div>
          ) : (
            <div className="mt-1 flex max-w-[210px] flex-wrap justify-end gap-1">
              {WEAPON_NAMES.map((n, i) => (
                <span
                  key={n}
                  className={`num border px-1 text-[10px] leading-[15px] ${
                    i === hud.weaponIdx
                      ? "border-[#FFB020] bg-[#FFB020]/20 text-[#FFB020]"
                      : "border-white/15 text-white/35"
                  }`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          )}
          {hud.prompt && (
            <div className="mt-1 text-[10px] tracking-[0.24em] text-[#FFB020]">{hud.prompt}</div>
          )}
        </div>
      </div>
    </div>
  );
}
