import { DurableObject } from "cloudflare:workers";

const allowedProductionOrigins = new Set([
  "https://catbox.party",
  "https://www.catbox.party",
  "https://catboxwebgames.pages.dev",
]);

function isAllowedOrigin(origin) {
  if (allowedProductionOrigins.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.catboxwebgames\.pages\.dev$/i.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function getIceServers(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  const headers = {
    ...corsHeaders(origin),
    "Cache-Control": "no-store",
  };
  const fallback = [{ urls: "stun:stun.cloudflare.com:3478" }];

  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
    return jsonResponse({ iceServers: fallback }, { headers });
  }

  try {
    const response = await fetch(
      "https://rtc.live.cloudflare.com/v1/turn/keys/"
        + encodeURIComponent(env.TURN_KEY_ID)
        + "/credentials/generate-ice-servers",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.TURN_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 3600 }),
      },
    );

    if (!response.ok) throw new Error("TURN credential request failed");
    const result = await response.json();
    if (!Array.isArray(result.iceServers) || !result.iceServers.length) {
      throw new Error("TURN credential response was invalid");
    }

    return jsonResponse({ iceServers: result.iceServers }, { headers });
  } catch (error) {
    console.warn("Falling back to STUN-only WebRTC", error);
    return jsonResponse({ iceServers: fallback }, { headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "catbox-game-rooms" });
    }

    if (request.method === "GET" && url.pathname === "/ice-servers") {
      return getIceServers(request, env);
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Za-z0-9_-]{22})$/);
    if (!roomMatch) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    if (!isAllowedOrigin(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "WebSocket upgrade required" }, { status: 426 });
    }

    const roomObjectId = env.GAME_ROOM.idFromName(roomMatch[1]);
    return env.GAME_ROOM.get(roomObjectId).fetch(request);
  },
};

export class GameRoom extends DurableObject {
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    const hostExists = this.ctx.getWebSockets("host").some(function (socket) {
      return socket.readyState === WebSocket.OPEN;
    });
    const guestExists = this.ctx.getWebSockets("guest").some(function (socket) {
      return socket.readyState === WebSocket.OPEN;
    });

    if (hostExists && guestExists) {
      this.ctx.acceptWebSocket(server, ["full"]);
      server.serializeAttachment({ role: "full" });
      server.send(JSON.stringify({ type: "room-full" }));
      server.close(1008, "Room is full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const role = hostExists ? "guest" : "host";
    const otherRole = role === "host" ? "guest" : "host";
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role: role });
    server.send(JSON.stringify({
      type: "joined",
      role: role,
      peerPresent: this.ctx.getWebSockets(otherRole).length > 0,
    }));

    this.sendToRole(otherRole, { type: "peer-joined" });
    return new Response(null, { status: 101, webSocket: client });
  }

  sendToRole(role, message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets(role)) {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    }
  }

  webSocketMessage(socket, rawMessage) {
    if (typeof rawMessage !== "string" || rawMessage.length > 32768) {
      socket.close(1009, "Message too large");
      return;
    }

    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (error) {
      return;
    }

    const attachment = socket.deserializeAttachment();
    const role = attachment?.role;
    const allowedByRole = role === "host"
      ? ["offer", "ice-candidate"].includes(message.type)
      : role === "guest" && ["answer", "ice-candidate"].includes(message.type);

    if (!allowedByRole || typeof message.payload !== "object" || !message.payload) return;
    this.sendToRole(role === "host" ? "guest" : "host", {
      type: message.type,
      payload: message.payload,
    });
  }

  webSocketClose(socket, code, reason) {
    const role = socket.deserializeAttachment()?.role;
    if (role === "host" || role === "guest") {
      this.sendToRole(role === "host" ? "guest" : "host", { type: "peer-left" });
    }
    socket.close(code, reason);
  }

  webSocketError(socket) {
    const role = socket.deserializeAttachment()?.role;
    if (role === "host" || role === "guest") {
      this.sendToRole(role === "host" ? "guest" : "host", { type: "peer-left" });
    }
    socket.close(1011, "WebSocket error");
  }
}
