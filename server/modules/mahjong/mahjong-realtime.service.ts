import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

const SOCKET_PATH = '/ws/mahjong';
const HEARTBEAT_INTERVAL_MS = 20 * 1000;

type RoomEvent = {
  type: 'room.updated';
  roomCode: string;
  version: number;
  reason: 'joined' | 'left' | 'seat' | 'mode' | 'transaction' | 'reversed' | 'dissolved';
};

type RoomUpdate = { version: number };
type UpdateWaiter = { since: number; resolve: (update: RoomUpdate) => void };

@Injectable()
export class MahjongRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(MahjongRealtimeService.name);
  private readonly roomSockets = new Map<string, Set<WebSocket>>();
  private readonly socketRooms = new Map<WebSocket, string>();
  private readonly roomVersions = new Map<string, number>();
  private readonly updateWaiters = new Map<string, Set<UpdateWaiter>>();
  private websocketServer: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  attach(server: HttpServer): void {
    if (this.websocketServer) return;

    const websocketServer = new WebSocketServer({ noServer: true });
    this.websocketServer = websocketServer;
    server.on('upgrade', (request, socket, head) => {
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      if (requestUrl.pathname !== SOCKET_PATH) {
        socket.destroy();
        return;
      }

      const roomCode = (requestUrl.searchParams.get('roomCode') || '')
        .trim()
        .toUpperCase();
      if (!roomCode || roomCode.length > 50) {
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (client) => {
        this.registerSocket(client, roomCode);
      });
    });

    this.heartbeatTimer = setInterval(() => {
      for (const client of websocketServer.clients) {
        if (client.readyState === WebSocket.OPEN) client.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  broadcast(
    roomCode: string,
    reason: RoomEvent['reason'],
  ): void {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const version = (this.roomVersions.get(normalizedRoomCode) || 0) + 1;
    this.roomVersions.set(normalizedRoomCode, version);
    const waiters = this.updateWaiters.get(normalizedRoomCode);
    if (waiters) {
      for (const waiter of waiters) {
        if (waiter.since < version) waiter.resolve({ version });
      }
      this.updateWaiters.delete(normalizedRoomCode);
    }
    const clients = this.roomSockets.get(normalizedRoomCode);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify({
      type: 'room.updated',
      roomCode: normalizedRoomCode,
      version,
      reason,
    } satisfies RoomEvent);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  getRoomVersion(roomCode: string): number {
    return this.roomVersions.get(roomCode.trim().toUpperCase()) || 0;
  }

  waitForUpdate(roomCode: string, since: number, timeoutMs = 20 * 1000): Promise<RoomUpdate> {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const currentVersion = this.getRoomVersion(normalizedRoomCode);
    if (currentVersion > since) return Promise.resolve({ version: currentVersion });

    return new Promise((resolve) => {
      const waiters = this.updateWaiters.get(normalizedRoomCode) || new Set<UpdateWaiter>();
      let timeout: ReturnType<typeof setTimeout>;
      const waiter: UpdateWaiter = { since, resolve: (update) => {
        clearTimeout(timeout);
        waiters.delete(waiter);
        if (waiters.size === 0) this.updateWaiters.delete(normalizedRoomCode);
        resolve(update);
      } };
      timeout = setTimeout(() => {
        waiters.delete(waiter);
        if (waiters.size === 0) this.updateWaiters.delete(normalizedRoomCode);
        resolve({ version: this.getRoomVersion(normalizedRoomCode) });
      }, timeoutMs);
      waiters.add(waiter);
      this.updateWaiters.set(normalizedRoomCode, waiters);
    });
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.socketRooms.keys()) client.close(1001, 'server stopping');
    this.socketRooms.clear();
    this.roomSockets.clear();
    for (const waiters of this.updateWaiters.values()) {
      for (const waiter of waiters) waiter.resolve({ version: 0 });
    }
    this.updateWaiters.clear();
    this.roomVersions.clear();
    this.websocketServer?.close();
    this.websocketServer = null;
  }

  private registerSocket(client: WebSocket, roomCode: string): void {
    const clients = this.roomSockets.get(roomCode) || new Set<WebSocket>();
    clients.add(client);
    this.roomSockets.set(roomCode, clients);
    this.socketRooms.set(client, roomCode);

    client.on('error', (error) => {
      this.logger.debug(`麻将实时连接异常: ${error.message}`);
    });
    client.on('close', () => this.removeSocket(client));
    client.send(JSON.stringify({
      type: 'connected',
      roomCode,
      version: this.getRoomVersion(roomCode),
    }));
  }

  private removeSocket(client: WebSocket): void {
    const roomCode = this.socketRooms.get(client);
    if (!roomCode) return;
    this.socketRooms.delete(client);
    const clients = this.roomSockets.get(roomCode);
    if (!clients) return;
    clients.delete(client);
    if (clients.size === 0) this.roomSockets.delete(roomCode);
  }
}
