/**
 * Postgres LISTEN bridge → in-process EventEmitter.
 *
 * Uses a single dedicated `pg.Client` connection that LISTENs on
 * `task_changes`. The bridge is initialised lazily on first SSE
 * subscription. We retain it across HMR by storing on globalThis.
 *
 * When the underlying pg connection drops (Postgres restart, network blip,
 * idle timeout) the bridge auto-reconnects with exponential backoff and
 * emits a `disconnect` event so SSE handlers can choose to close client
 * streams (which lets browsers do their own EventSource reconnect).
 */
import { EventEmitter } from 'node:events';
import { Client } from 'pg';
import { getConfig } from '@/lib/env';

declare global {
  var __todoLoraBridge: TaskChangeBridge | undefined;
}

type ListenerHandle = (raw: string) => void;
type DisconnectHandle = () => void;

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export class TaskChangeBridge {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = RECONNECT_INITIAL_MS;
  private bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(50);
  }

  async ensureConnected(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const cfg = getConfig();
      const c = new Client({ connectionString: cfg.databaseUrl });
      try {
        c.on('error', () => this.handleDisconnect());
        c.on('end', () => this.handleDisconnect());
        await c.connect();
        c.on('notification', (msg) => {
          if (msg.channel === 'task_changes' && msg.payload) {
            this.bus.emit('task', msg.payload);
          }
        });
        await c.query('LISTEN task_changes');
        this.client = c;
        // Successful connect — reset backoff for the next outage.
        this.reconnectDelayMs = RECONNECT_INITIAL_MS;
      } catch (err) {
        c.removeAllListeners();
        await c.end().catch(() => {});
        throw err;
      }
    })();

    try {
      await this.connecting;
    } catch {
      // Connect failed — schedule a reconnect attempt and re-throw so the
      // first caller sees the failure (the SSE handler will close the stream
      // and the browser will reconnect).
      this.handleDisconnect();
      throw new Error('LISTEN bridge connect failed');
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Drop the current client (if any) and schedule a reconnect attempt with
   * exponential backoff. Subscriptions on the bus are NOT cleared — they
   * resume receiving events once the new connection is established.
   */
  private handleDisconnect(): void {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        void this.client.end();
      } catch {
        /* swallow — we're tearing down anyway */
      }
      this.client = null;
    }
    this.bus.emit('disconnect');

    if (this.reconnectTimer) return; // already scheduled
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => {
        /* ensureConnected already scheduled the next retry */
      });
    }, delay);
  }

  onTask(handler: ListenerHandle): () => void {
    this.bus.on('task', handler);
    return () => this.bus.off('task', handler);
  }

  onDisconnect(handler: DisconnectHandle): () => void {
    this.bus.on('disconnect', handler);
    return () => this.bus.off('disconnect', handler);
  }
}

export function getBridge(): TaskChangeBridge {
  if (globalThis.__todoLoraBridge) return globalThis.__todoLoraBridge;
  globalThis.__todoLoraBridge = new TaskChangeBridge();
  return globalThis.__todoLoraBridge;
}
