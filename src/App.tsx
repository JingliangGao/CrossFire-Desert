import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Fps, type HudState, type Status } from "./game/fps";
import { BOT_NAMES } from "./game/names";
import { snd } from "./game/sound";
import { formatDate, loadScores, saveScore, type ScoreRow } from "./game/scores";
import { Hud } from "./ui/Hud";
import { Menu, Over, Paused } from "./ui/Screens";

/** shown before the engine has produced its first frame, so the menu always exists */
const DEFAULT_HUD: HudState = {
  status: "menu",
  hp: 100,
  armor: 100,
  ammo: 30,
  reserve: 120,
  weapon: "MP5",
  weaponIdx: 0,
  weaponType: "gun",
  slots: [
    { name: "MP5", type: "gun" },
    { name: "AWM", type: "gun" },
    { name: "匕首", type: "knife" },
    { name: "手雷", type: "grenade" },
  ],
  reloading: 0,
  kills: 0,
  headshots: 0,
  streak: 0,
  bestStreak: 0,
  score: 0,
  time: 0,
  wave: 1,
  alive: 0,
  radar: { px: 0, pz: 62, yaw: 0, dots: [], aliens: [] },
  feed: [],
  prompt: "",
  alert: "",
  markers: [],
  peers: 0,
  net: "off",
};

export default function App() {
  const cv3 = useRef<HTMLCanvasElement>(null);
  const cv2 = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Fps | null>(null);
  const prevStatus = useRef<Status>("menu");

  const [hud, setHud] = useState<HudState | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>(() => loadScores());
  const [rank, setRank] = useState(0);
  const [muted, setMuted] = useState(snd.muted);
  const [touch, setTouch] = useState(false);
  const touchRef = useRef(false);
  const hadLock = useRef(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    const isTouch = window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
    touchRef.current = isTouch;
    setTouch(isTouch);
  }, []);

  useEffect(() => {
    if (!cv3.current || !cv2.current) return;
    // if WebGL or the post chain is unavailable the menu must still work, so
    // never let an engine throw take the React tree down with it
    let g: Fps | null = null;
    try {
      g = new Fps(cv3.current, cv2.current, (h) => setHud({ ...h }), BOT_NAMES);
      gameRef.current = g;
    } catch (err) {
      console.error("[CF] engine failed to start", err);
      setEngineError(
        err instanceof Error && /webgl|context|shader/i.test(err.message)
          ? "此设备不支持 WebGL，无法进入 3D 战场。"
          : "渲染引擎启动失败，请刷新重试。",
      );
      gameRef.current = null;
    }
    return () => {
      g?.destroy();
      gameRef.current = null;
    };
  }, []);

  // record the run exactly once when the round ends
  useEffect(() => {
    const s = hud?.status;
    if (s === "over" && prevStatus.current === "playing" && hud) {
      const { rows, rank: r } = saveScore({
        score: hud.score,
        kills: hud.kills,
        headshots: hud.headshots,
        time: hud.time,
        date: formatDate(),
      });
      setScores(rows);
      setRank(r);
    }
    if (s === "playing") setRank(0);
    if (s === "over" || s === "menu" || s === "paused") {
      if (document.pointerLockElement) document.exitPointerLock();
    }
    prevStatus.current = s ?? "menu";
  }, [hud?.status, hud?.score, hud?.kills, hud?.time]);

  const start = useCallback(() => {
    if (!gameRef.current) {
      setEngineError((m) => m ?? "渲染引擎未就绪，请刷新页面重试。");
      return;
    }
    setRank(0);
    gameRef.current.startGame();
    gameRef.current.lock();
  }, []);

  useEffect(() => {
    const onLockChange = () => {
      const g = gameRef.current;
      if (!g) return;
      if (document.pointerLockElement) {
        hadLock.current = true;
        return;
      }
      // 只有"我方持有过指针锁又丢失"才自动暂停：触屏设备从未持有锁，
      // 处于 null 状态是常态，绝不能据此暂停（否则 playing↔paused 反复闪烁）
      const lost = hadLock.current;
      hadLock.current = false;
      if (lost && !touchRef.current && g.status === "playing") g.pause();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const st = gameRef.current?.status ?? "menu";
      if (k === "enter" && (st === "menu" || st === "over")) start();
      if (k === "enter" && st === "paused") gameRef.current?.resume();
      if (k === "r" && (st === "playing" || st === "over" || st === "paused")) start();
      if (k === "m") setMuted(snd.toggle());
    };
    const onCtx = (e: Event) => e.preventDefault();
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [start]);

  /* ---------------------------------------------------------- touch control */
  const stick = useRef({ id: -1, ox: 0, oy: 0 });
  const look = useRef({ id: -1, x: 0, y: 0 });
  const knobRef = useRef<HTMLDivElement>(null);
  const setKnob = (x: number, y: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };

  const stickDown = (e: RPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
  };
  const stickMove = (e: RPointerEvent) => {
    if (stick.current.id !== e.pointerId) return;
    const dx = e.clientX - stick.current.ox;
    const dy = e.clientY - stick.current.oy;
    const max = 52;
    const l = Math.hypot(dx, dy) || 1;
    const cl = Math.min(1, l / max);
    setKnob((dx / l) * cl * max, (dy / l) * cl * max);
    gameRef.current?.setMove((dx / max) * cl, (dy / max) * cl);
  };
  const stickUp = (e: RPointerEvent) => {
    if (stick.current.id !== e.pointerId) return;
    stick.current.id = -1;
    setKnob(0, 0);
    gameRef.current?.setMove(0, 0);
  };

  const status = hud?.status ?? "menu";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0B0E0B]" style={{ touchAction: "none" }}>
      <canvas
        ref={cv3}
        className="absolute inset-0 h-full w-full"
        onClick={() => {
          if (gameRef.current?.status === "playing") gameRef.current.lock();
        }}
        onMouseMove={(e) => {
          if (!touch && !document.pointerLockElement && e.buttons === 1 && gameRef.current?.status === "playing") {
            gameRef.current.look(e.movementX * 0.85, e.movementY * 0.85);
          }
        }}
      />
      <canvas ref={cv2} className="pointer-events-none absolute inset-0 h-full w-full" />

      {hud && (status === "playing" || status === "paused") && (
        <Hud hud={hud} shapes={gameRef.current?.radarShapes ?? []} />
      )}

      {/* touch layer */}
      {touch && status === "playing" && (
        <div className="absolute inset-0 z-20" style={{ touchAction: "none" }}>
          <div
            className="absolute inset-0"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              e.preventDefault();
              if (look.current.id >= 0) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              if (look.current.id !== e.pointerId) return;
              gameRef.current?.look((e.clientX - look.current.x) * 1.4, (e.clientY - look.current.y) * 1.4);
              look.current.x = e.clientX;
              look.current.y = e.clientY;
            }}
            onPointerUp={() => (look.current.id = -1)}
            onPointerCancel={() => (look.current.id = -1)}
          />
          {/* virtual stick */}
          <div
            className="absolute bottom-24 left-4 h-[136px] w-[136px] rounded-full border border-white/15 bg-white/8 backdrop-blur-[3px]"
            onPointerDown={stickDown}
            onPointerMove={stickMove}
            onPointerUp={stickUp}
            onPointerCancel={stickUp}
          >
            <div
              ref={knobRef}
              className="absolute top-1/2 left-1/2 h-14 w-14 rounded-full border border-white/25 bg-white/30"
              style={{ transform: "translate(-50%, -50%)" }}
            />
          </div>
          {/* fire / actions */}
          <button
            className="absolute right-5 bottom-28 h-[92px] w-[92px] rounded-full border-2 border-[#E23A2E]/70 bg-[#E23A2E]/35 text-[15px] font-black tracking-[0.2em] text-white active:bg-[#E23A2E]/70"
            onPointerDown={(e) => {
              e.preventDefault();
              gameRef.current?.setFiring(true);
            }}
            onPointerUp={() => gameRef.current?.setFiring(false)}
            onPointerCancel={() => gameRef.current?.setFiring(false)}
          >
            开火
          </button>
          <div className="absolute right-[100px] bottom-4 flex gap-2 sm:right-[118px]">
            {[
              ["装弹", () => gameRef.current?.reloadNow()],
              ["跳", () => gameRef.current?.jump()],
              ["镜", () => gameRef.current?.toggleScope()],
              ["枪", () => gameRef.current?.cycleWeapon(1)],
              ["拾", () => gameRef.current?.pickupNow()],
              ["丢", () => gameRef.current?.dropNow()],
            ].map(([label, fn]) => (
              <button
                key={label as string}
                className="h-[52px] w-[52px] rounded-[12px] border border-white/12 bg-black/35 text-[12px] text-white/85 backdrop-blur-[3px] active:bg-white/25"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (fn as () => void)();
                }}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>
      )}

      {engineError && (
        <div className="absolute inset-x-0 top-0 z-40 bg-[#7a1610] px-4 py-2 text-center text-[12px] tracking-[0.12em] text-[#FFE9C8]">
          {engineError}
        </div>
      )}

      {/* the menus must render even if the engine never produced a frame,
          otherwise a dead WebGL context would take every button with it */}
      {(() => {
        const h = hud ?? DEFAULT_HUD;
        return (
          <>
          {status === "menu" && (
            <Menu
              hud={h}
              scores={scores}
              rank={rank}
              onStart={start}
              onResume={() => gameRef.current?.resume()}
              onRestart={start}
              onMenu={() => gameRef.current?.toMenu()}
              onToggleMute={() => setMuted(snd.toggle())}
              muted={muted}
            />
          )}
          {status === "paused" && (
            <Paused
              hud={h}
              scores={scores}
              rank={rank}
              onStart={start}
              onResume={() => gameRef.current?.resume()}
              onRestart={start}
              onMenu={() => gameRef.current?.toMenu()}
              onToggleMute={() => setMuted(snd.toggle())}
              muted={muted}
            />
          )}
          {status === "over" && (
            <Over
              hud={h}
              scores={scores}
              rank={rank}
              onStart={start}
              onResume={() => gameRef.current?.resume()}
              onRestart={start}
              onMenu={() => gameRef.current?.toMenu()}
              onToggleMute={() => setMuted(snd.toggle())}
              muted={muted}
            />
          )}
          </>
        );
      })()}
    </div>
  );
}
