import { Injectable, signal } from '@angular/core';

/** A visual notification kind — drives the accent colour and the leading icon. */
export type ToastKind = 'success' | 'error' | 'info';

/** A single live toast. `id` is a stable, monotonically increasing counter. */
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;  
}

/** How long a toast stays on screen before it auto-dismisses (ms). */
const AUTO_DISMISS_MS = 4000;

/**
 * A tiny, dependency-free notification store. Components push transient messages
 * (`success` / `error` / `info`); the {@link ToastHost} mounted in the shell renders
 * them. Toasts auto-dismiss after ~4s and can be closed early via {@link dismiss}.
 *
 * Signal-based on purpose: it stays clear of the HTTP tree so even the
 * {@link GlobalErrorHandler} (constructed before most DI providers) could surface
 * messages through it without a circular-dependency risk.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** The live toasts, newest last. Read by the host for rendering. */
  readonly toasts = signal<readonly Toast[]>([]);

  /** Incrementing id source — deterministic, unlike Date.now()/Math.random(). */
  private nextId = 0;

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  /** Remove a toast by id (called by the close button and the auto-dismiss timer). */
  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, message: string): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
  }
}
