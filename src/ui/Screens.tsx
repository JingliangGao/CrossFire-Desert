import type { HudState } from "../game/fps";
import { WEAPON_NAMES } from "../game/fps";
import type { ScoreRow } from "../game/scores";
import { PLAYER_NAME } from "./Hud";

interface Props {
  hud: HudState;
  scores: ScoreRow[];
  rank: number;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
  muted: boolean;
}

function Table({ scores }: { scores: ScoreRow[] }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between border-b border-white/15 pb-1">
        <span className="label text-[10px] text-white/70">战绩榜</span>
        <span className="text-[9px] tracking-[0.18em] text-white/35">本机前五 · 击杀 / 存活</span>
      </div>
      {scores.length === 0 ? (
        <p className="py-2 text-[11px] leading-relaxed text-white/45">暂无战绩 —— 第一场由你来打。</p>
      ) : (
        <ol className="divide-y divide-white/10">
          {scores.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-1">
              <span className="num w-4 text-[13px] text-[#FFB020]">{i + 1}</span>
              <span className="num flex-1 text-[17px] leading-none text-white">{String(r.score).padStart(5, "0")}</span>
              <span className="num text-[11px] text-white/50">
                杀{String(r.kills).padStart(2, "0")} · {String(r.time).padStart(3, "0")}s
              </span>
              <span className="num hidden text-[10px] text-white/30 sm:inline">{r.date}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const KeyCap = ({ k }: { k: string }) => (
  <span className="num mr-1 inline-block min-w-[18px] border border-white/25 bg-white/8 px-1 text-[10px] leading-[15px] text-white/80">
    {k}
  </span>
);

export function Menu({ scores, onStart, onToggleMute, muted }: Props) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto" style={{ background: "rgba(6,9,7,0.68)" }}>
      <div className="mx-auto flex min-h-full max-w-[1180px] flex-col gap-5 px-4 py-6 lg:flex-row lg:items-center lg:gap-8">
        {/* left: title + briefing */}
        <div className="rise flex-1">
          <div className="text-[10px] tracking-[0.5em] text-white/45">CROSSFIRE · 浏览器作战</div>
          <h1 className="mt-1 flex items-baseline gap-3">
            <span
              className="text-[46px] leading-none font-black tracking-[0.06em] text-[#F0E6D2] sm:text-[64px]"
              style={{ textShadow: "0 3px 0 rgba(120,20,10,0.65), 0 10px 30px rgba(0,0,0,0.7)" }}
            >
              穿越火线
            </span>
            <span className="num text-[22px] tracking-[0.22em] text-[#FFB020] sm:text-[28px]">沙漠-1</span>
          </h1>
          <div className="mt-2 h-px w-full max-w-[520px] bg-gradient-to-r from-[#E23A2E] via-white/25 to-transparent" />

          <p className="mt-3 max-w-[520px] text-[12px] leading-relaxed text-white/70">
            炽日下的边境小镇。士兵从两翼压来，天空里还会掠过直升机、战斗机和飞碟——
            飞碟落地就会放出外星人，他们的能量束对你和士兵都致命。
          </p>

          <div className="mt-4 grid max-w-[520px] grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-white/70">
            <span>
              <KeyCap k="W A S D" />
              移动
            </span>
            <span>
              <KeyCap k="鼠标" />
              转身瞄准
            </span>
            <span>
              <KeyCap k="左键" />
              开火
            </span>
            <span>
              <KeyCap k="右键" />
              开镜瞄准
            </span>
            <span>
              <KeyCap k="R" />
              装弹
            </span>
            <span>
              <KeyCap k="1-8" />
              {WEAPON_NAMES.join(" / ")}
            </span>
            <span>
              <KeyCap k="空格" />
              跳跃
            </span>
            <span>
              <KeyCap k="Shift" />
              静步慢行
            </span>
            <span>
              <KeyCap k="Esc" />
              暂停
            </span>
            <span>
              <KeyCap k="M" />
              静音
            </span>
            <span className="col-span-2 border-t border-white/10 pt-1.5 text-[10px] leading-relaxed text-white/45">
              局域网联机：先 <b className="text-[#39FFE0]">npm run build</b>，再 <b className="text-[#39FFE0]">node server.mjs</b>，
              同一 Wi-Fi 下的手机/电脑打开本机 IP:8787 即可并肩作战；没开服务器时同浏览器多标签也能联机。
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-cf focusable px-8 py-3 text-[15px]" onClick={onStart}>
              开始游戏
            </button>
            <button className="btn-ghost focusable px-5 py-3 text-[12px]" onClick={onToggleMute}>
              {muted ? "音效：关" : "音效：开"}
            </button>
          </div>
          <p className="mt-2 text-[10px] tracking-[0.2em] text-white/35">
            触屏：左半屏拖动移动 · 右半屏拖动转身 · 右下角开火/装弹/跳
          </p>
        </div>

        {/* right: map preview + leaderboard */}
        <div className="rise w-full lg:w-[380px]">
          <div className="panel p-2">
            <div className="relative overflow-hidden">
              <img
                src="images/menu_bg.jpg"
                alt="沙漠-1 地图实景"
                className="h-[190px] w-full object-cover sm:h-[240px]"
                style={{ filter: "saturate(0.9) contrast(1.05)" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(6,9,7,0.45) 0%, rgba(6,9,7,0) 45%, rgba(6,9,7,0.85) 100%)" }}
              />
              <div className="absolute right-3 bottom-2 left-3 flex items-end justify-between">
                <div>
                  <div className="label text-[9px] text-white/55">地图</div>
                  <div className="num text-[20px] leading-none text-white">沙漠-1</div>
                </div>
                <div className="num text-[11px] text-white/60">150m × 150m · 6 区</div>
              </div>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/55">
              <li>· 匪家南广场</li>
              <li>· 中路喷泉广场</li>
              <li>· A 大道柱廊</li>
              <li>· B 通道市集</li>
              <li>· A / B 爆破点</li>
              <li>· 警家北广场</li>
            </ul>
          </div>
          <div className="panel mt-3 p-3">
            <Table scores={scores} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Paused({ onResume, onRestart, onMenu, hud }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(6,9,7,0.72)" }}>
      <div className="rise panel w-[320px] px-6 py-6 text-center sm:w-[380px]">
        <div className="label text-[9px] text-white/45">交火暂停</div>
        <h2 className="mt-1 text-[34px] leading-none font-black tracking-[0.16em]">暂停</h2>
        <div className="num mt-2 text-[13px] text-white/55">
          击杀 {hud.kills} · 得分 {hud.score} · 存活 {hud.time}s
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          <button className="btn-cf focusable py-3 text-[14px]" onClick={onResume}>
            继续游戏
          </button>
          <button className="btn-ghost focusable py-2.5 text-[12px]" onClick={onRestart}>
            重新开始
          </button>
          <button className="btn-ghost focusable py-2.5 text-[12px]" onClick={onMenu}>
            返回主菜单
          </button>
        </div>
        <div className="mt-4 text-[10px] tracking-[0.18em] text-white/35">按 Esc 或点击「继续游戏」回到战场</div>
      </div>
    </div>
  );
}

export function Over({ hud, scores, rank, onStart, onMenu }: Props) {
  const rows: [string, string][] = [
    ["击杀", String(hud.kills).padStart(2, "0")],
    ["爆头", String(hud.headshots).padStart(2, "0")],
    ["最高连杀", `×${hud.bestStreak}`],
    ["到达波次", String(hud.wave)],
    ["存活时间", `${hud.time}s`],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6" style={{ background: "rgba(30,6,4,0.62)" }}>
      <div className="rise w-full max-w-[520px]">
        <div className="text-center">
          <div className="label text-[9px] text-white/50">{PLAYER_NAME} · 阵亡</div>
          <h2
            className="mt-1 text-[52px] leading-none font-black tracking-[0.14em] text-[#F0E6D2] sm:text-[64px]"
            style={{ textShadow: "0 3px 0 rgba(120,20,10,0.7)" }}
          >
            阵亡
          </h2>
        </div>
        <div className="panel mt-4 px-5 py-4">
          <div className="flex items-end justify-between border-b border-white/12 pb-2">
            <span className="label text-[9px] text-white/45">本局得分</span>
            <span className="num text-[44px] leading-none text-[#FFB020]">{String(hud.score).padStart(5, "0")}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between border-b border-white/8 py-0.5">
                <dt className="text-white/45">{k}</dt>
                <dd className="num text-[16px] text-white">{v}</dd>
              </div>
            ))}
          </dl>
          {rank > 0 && rank <= 5 && (
            <div className="mt-3 bg-[#FFB020] px-3 py-1 text-center text-[11px] font-black tracking-[0.3em] text-[#241505]">
              战绩榜第 {rank} 位
            </div>
          )}
          <div className="mt-4">
            <Table scores={scores} />
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-3">
          <button className="btn-cf focusable px-8 py-3 text-[15px]" onClick={onStart}>
            再来一局
          </button>
          <button className="btn-ghost focusable px-6 py-3 text-[12px]" onClick={onMenu}>
            返回主菜单
          </button>
        </div>
        <div className="mt-2 text-center text-[10px] tracking-[0.18em] text-white/35">按 R / 空格 立即重开</div>
      </div>
    </div>
  );
}
