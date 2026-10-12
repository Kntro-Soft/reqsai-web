import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { AiQuotaError, atLeast, isQuotaWarning, levelOf } from './ai-quota';
import { QuotaLevel, SubscriptionUsageResponse } from './billing.models';

/**
 * Where the organization stands against its monthly AI allowance, as far as this browser knows:
 * from the usage page (owners), from the `TOKEN_QUOTA_WARNING` pushes on the organization's usage
 * topic, from a refused AI request (402) and from a live session being paused. The capture page
 * reads it to show its compact notice; only the owner can load the usage page itself.
 */
@Injectable({ providedIn: 'root' })
export class AiQuotaStore {
  private readonly realtime = inject(RealtimeService);

  private readonly _level = signal<QuotaLevel>('NONE');
  private readonly _used = signal<number | null>(null);
  private readonly _limit = signal<number | null>(null);
  private readonly _resetsAt = signal<string | null>(null);
  private readonly _pausedSessions = signal<ReadonlySet<string>>(new Set());
  private watching: { orgId: string; subscription: Subscription } | null = null;

  readonly level = this._level.asReadonly();
  readonly used = this._used.asReadonly();
  readonly limit = this._limit.asReadonly();
  readonly resetsAt = this._resetsAt.asReadonly();
  readonly exhausted = computed(() => this._level() === 'EXHAUSTED');
  /** The capture page shows its notice from 90 % on. */
  readonly nearOrOver = computed(() => atLeast(this._level(), 'WARNING_90'));
  readonly anyPaused = computed(() => this._pausedSessions().size > 0);

  /** Takes the owner's usage page as the truth. */
  applyUsage(usage: SubscriptionUsageResponse): void {
    this._level.set(usage.warningLevel ?? levelOf(usage.tokensUsed, usage.tokensLimit));
    this._used.set(usage.tokensUsed);
    this._limit.set(usage.tokensLimit);
    this._resetsAt.set(usage.currentPeriodEnd);
    if (this._level() !== 'EXHAUSTED') this._pausedSessions.set(new Set());
  }

  /** A refused AI request: the allowance is spent. */
  applyExceeded(error: AiQuotaError): void {
    this._level.set('EXHAUSTED');
    if (error.used !== null) this._used.set(error.used);
    if (error.limit !== null) this._limit.set(error.limit);
    if (error.resetsAt) this._resetsAt.set(error.resetsAt);
  }

  /** A live session's suggestions were paused by the allowance. */
  notePaused(sessionId: string, error: AiQuotaError): void {
    this.applyExceeded(error);
    this._pausedSessions.update((set) => new Set(set).add(sessionId));
  }

  /** Suggestions flow again for the session. */
  clearPaused(sessionId: string): void {
    if (!this._pausedSessions().has(sessionId)) return;
    this._pausedSessions.update((set) => {
      const next = new Set(set);
      next.delete(sessionId);
      return next;
    });
  }

  isPaused(sessionId: string | null | undefined): boolean {
    return !!sessionId && this._pausedSessions().has(sessionId);
  }

  /** Follows the organization's usage topic (idempotent per organization). */
  watch(orgId: string): void {
    if (this.watching?.orgId === orgId) return;
    this.watching?.subscription.unsubscribe();
    const subscription = this.realtime.watch<unknown>(`organizations/${orgId}/usage`).subscribe({
      next: (message) => {
        if (!isQuotaWarning(message)) return;
        this._level.set(message.level);
        this._used.set(message.tokensUsed);
        this._limit.set(message.tokensLimit);
        if (message.level !== 'EXHAUSTED') this._pausedSessions.set(new Set());
      },
      error: () => undefined,
    });
    this.watching = { orgId, subscription };
  }

  reset(): void {
    this.watching?.subscription.unsubscribe();
    this.watching = null;
    this._level.set('NONE');
    this._used.set(null);
    this._limit.set(null);
    this._resetsAt.set(null);
    this._pausedSessions.set(new Set());
  }
}
