/**
 * 联机同步层。
 *
 * 优先连接同机 WebSocket 中继（server.mjs，端口 8787）；没有服务器时退回
 * BroadcastChannel，同一个浏览器里开多个标签页也能一起玩 —— 联机能力永远可用。
 *
 * 消息（JSON）：
 *  j  加入      {id,name,x,y,z,yaw}
 *  p  状态      {id,x,y,z,yaw,hp}
 *  f  射击      {id,from:[3],to:[3]}
 *  h  命中      {id,kind:'bot'|'alien',p:[3],dmg,head}
 *  x  离开      {id}
 */
export type InMsg =
  | { t: "j" | "p"; id: string; name: string; x: number; y: number; z: number; yaw: number; hp?: number }
  | { t: "f"; id: string; name?: string; from: number[]; to: number[] }
  | { t: "h"; id: string; kind: "bot" | "alien"; p: number[]; dmg: number; head: boolean }
  | { t: "x"; id: string; name?: string };

export type SendFn = (m: InMsg) => void;

export interface NetHandles {
  onPeer: (m: InMsg) => void;
  onStatus: (s: "off" | "ws" | "local", count: number) => void;
}

const rid = () => Math.random().toString(36).slice(2, 9);

export class Net {
  readonly id = rid();
  name = "玩家" + Math.floor(1000 + Math.random() * 9000);
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private peers = new Set<string>();
  private status: "off" | "ws" | "local" = "off";
  private h: NetHandles;

  constructor(h: NetHandles) {
    this.h = h;
    const loc = window.location;
    const wantWs = !["localhost", "127.0.0.1"].includes(loc.hostname) || loc.port === "8787";
    if (wantWs) this.openWs();
    else this.openLocal();
  }

  get count() {
    return this.peers.size;
  }
  get mode() {
    return this.status;
  }

  private setStatus(s: "off" | "ws" | "local") {
    if (this.status === s) return;
    this.status = s;
    this.h.onStatus(s, this.peers.size);
  }

  private openWs() {
    try {
      const loc = window.location;
      const url = `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.hostname}:8787`;
      const ws = new WebSocket(url);
      const fail = () => {
        if (this.status !== "ws") {
          this.ws = null;
          this.openLocal();
        }
      };
      ws.onopen = () => {
        this.ws = ws;
        this.setStatus("ws");
        this.send({ t: "j", id: this.id, name: this.name, x: 0, y: 0, z: 0, yaw: 0 });
      };
      ws.onmessage = (e) => this.receive(String(e.data));
      ws.onerror = fail;
      ws.onclose = fail;
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) fail();
      }, 3500);
    } catch {
      this.openLocal();
    }
  }

  private openLocal() {
    if (this.bc) return;
    try {
      this.bc = new BroadcastChannel("cf-lan");
      this.bc.onmessage = (e) => this.receive(JSON.stringify(e.data));
      this.setStatus("local");
    } catch {
      this.setStatus("off");
    }
  }

  private receive(raw: string) {
    let m: InMsg;
    try {
      m = JSON.parse(raw) as InMsg;
    } catch {
      return;
    }
    if (m.id === this.id) return;
    const before = this.peers.size;
    if (m.t === "j") this.peers.add(m.id);
    if (m.t === "x") this.peers.delete(m.id);
    this.h.onPeer(m);
    // 只在人数变化时上报：之前每条消息（含 12.5Hz 的位置包）都触发
    // onStatus → emit(true) 强制整棵 React 树重渲染，手机端因此整页闪烁
    if (this.peers.size !== before) this.h.onStatus(this.status, this.peers.size);
  }

  send(m: InMsg) {
    const raw = JSON.stringify(m);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(raw);
    else if (this.bc) {
      try {
        this.bc.postMessage(m);
      } catch {
        /* ignore */
      }
    }
  }

  destroy() {
    try {
      this.send({ t: "x", id: this.id, name: this.name });
      this.ws?.close();
      this.bc?.close();
    } catch {
      /* ignore */
    }
  }
}
