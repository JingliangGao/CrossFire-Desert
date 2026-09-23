/**
 * 局域网联机服务器 —— 让同一 Wi-Fi 下的手机/电脑一起进场
 *
 *   1. npm run build        （先构建游戏）
 *   2. node server.mjs      （本机运行）
 *   3. 其他设备打开 http://<本机IP>:8787   亦可按屏幕提示查看地址
 *
 * 同时承担两件事：静态托管 dist/，以及把玩家位置/射击消息广播给所有人。
 * 不依赖任何构建配置，绑定 0.0.0.0，同一局域网均可访问。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT || 8787);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    // no-store：手机浏览器一旦缓存旧版单文件包，之后的修复就全部无效
    const headers = (type) => ({ "content-type": type, "cache-control": "no-store" });
    if (err) {
      // 单文件构建：任何未知路径都回退到 index.html
      fs.readFile(path.join(ROOT, "index.html"), (e2, html) => {
        if (e2) return res.writeHead(404).end("not found");
        res.writeHead(200, headers(TYPES[".html"])).end(html);
      });
      return;
    }
    res.writeHead(200, headers(TYPES[path.extname(file)] || "application/octet-stream")).end(buf);
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const text = String(data);
    for (const peer of wss.clients) {
      if (peer !== ws && peer.readyState === peer.OPEN) peer.send(text);
    }
  });
  ws.on("error", () => {});
});

server.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const list of Object.values(nets)) {
    for (const ni of list || []) if (ni.family === "IPv4" && !ni.internal) addrs.push(ni.address);
  }
  console.log("");
  console.log("  ▸ 沙漠之鹰  局域网联机已就绪");
  console.log("  本机地址 : http://localhost:" + PORT);
  for (const a of addrs) console.log("  局域网地址: http://" + a + ":" + PORT);
  console.log("");
});
