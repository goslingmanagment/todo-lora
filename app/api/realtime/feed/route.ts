import { NextResponse, type NextRequest } from 'next/server';
import { getBridge } from '@/lib/realtime/bridge';
import { getCurrentAuth } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * SSE endpoint. Authenticated callers receive an event stream of task-change
 * invalidations. Stream closes if the request is aborted (browser navigation,
 * tab close, network blip).
 */
export async function GET(req: NextRequest) {
  const auth = await getCurrentAuth();
  if (!auth) return new NextResponse('Unauthorized', { status: 401 });

  const bridge = getBridge();
  await bridge.ensureConnected();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      // Initial hello so the EventSource fires `open` immediately.
      send('hello', JSON.stringify({ at: Date.now() }));

      const off = bridge.onTask((payload) => {
        send('task', payload);
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream closed */
        }
      }, 25_000);

      // Holder so `close` can be referenced from the disconnect handler
      // (defined below) without a temporal-dead-zone error.
      let offDisconnect: (() => void) | null = null;

      const close = () => {
        clearInterval(heartbeat);
        off();
        offDisconnect?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // If the LISTEN bridge drops (Postgres restart, network blip), close
      // this client stream so the browser's EventSource reconnects. The
      // bridge itself is also reconnecting in the background; closing here
      // additionally guarantees the client refetches after reconnect via
      // the focus/visibility refresh in RealtimeRefresh.tsx.
      offDisconnect = bridge.onDisconnect(() => close());

      req.signal.addEventListener('abort', close);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
