import { Injectable, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

/**
 * STOMP-over-WebSocket client (see ADR-0007). One shared connection per app;
 * callers `watch()` logical topics and get a typed, auto-(re)subscribing stream.
 * The access token is sent on the STOMP CONNECT frame and re-read before every
 * (re)connect so a rotated token keeps the socket authenticated.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthStore);
  private rx: RxStomp | null = null;
  private readonly _connected = signal(false);

  /** True while the STOMP connection is open. */
  readonly connected = this._connected.asReadonly();

  /** Subscribe to a logical topic (without the `/topic` prefix), parsed as T. */
  watch<T>(topic: string): Observable<T> {
    return this.client()
      .watch(`/topic/${topic}`)
      .pipe(map((frame) => JSON.parse(frame.body) as T));
  }

  /** Tear down the connection (e.g. on sign-out). */
  disconnect(): void {
    void this.rx?.deactivate();
    this.rx = null;
    this._connected.set(false);
  }

  private client(): RxStomp {
    if (this.rx) return this.rx;
    const rx = new RxStomp();
    rx.configure({
      brokerURL: brokerUrl(),
      beforeConnect: (client: RxStomp) => {
        client.configure({
          connectHeaders: { Authorization: `Bearer ${this.auth.accessToken() ?? ''}` },
        });
      },
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      reconnectDelay: 3_000,
    });
    rx.connectionState$.subscribe((state) => this._connected.set(state === RxStompState.OPEN));
    rx.activate();
    this.rx = rx;
    return rx;
  }
}

function brokerUrl(): string {
  // Namespaced under /ws/stomp (not the bare /ws) so it doesn't collide with the Angular dev server's
  // own live-reload WebSocket, which silently swallows a proxied /ws upgrade in development.
  if (environment.wsUrl) return `${environment.wsUrl}/ws/stomp`;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws/stomp`;
}
