import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  ReplaySubject,
  Subscription,
  catchError,
  finalize,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DiscoveryApiService } from './discovery-api.service';
import {
  AssistantExchangeResponse,
  AssistantMessageResponse,
  SessionSuggestionCodeMessage,
  SuggestionResponse,
} from './discovery.models';
import { appendExchange, replaceSuggestion, updateReplySuggestion } from './assistant-chat';
import {
  VERIFY_TIMEOUT_MS,
  failVerification,
  startVerifying,
  verifyStateOf,
  withCodeUpdate,
} from './code-verification';
import { SuggestionCodeInsight } from './codebase.models';

/**
 * State of the project's assistant chat on the capture page: the conversation, the message being
 * answered and the review state of the suggestions the replies raised. Decisions themselves go
 * through {@link DiscoveryChatStore.decide} (which also refreshes the backlog); the page hands the
 * resolved suggestion back here with {@link applyDecision}.
 */
@Injectable()
export class AssistantChatStore {
  private readonly api = inject(DiscoveryApiService);
  private readonly realtime = inject(RealtimeService);

  /** The project's suggestions topic: where the verdicts of chat suggestions (no session) arrive. */
  private realtimeSub: Subscription | null = null;
  /** Gives up on a verification whose verdict never arrived, so its card offers a retry. */
  private readonly verifyTimers = new Map<string, Subscription>();

  private readonly _messages = signal<AssistantMessageResponse[]>([]);
  private readonly _pendingQuestion = signal<string | null>(null);
  private projectId: string | null = null;

  readonly messages = this._messages.asReadonly();
  /** What the analyst just sent, shown while ReqsAI answers. */
  readonly pendingQuestion = this._pendingQuestion.asReadonly();
  readonly sending = computed(() => this._pendingQuestion() !== null);
  readonly hasMessages = computed(() => this._messages().length > 0 || this.sending());

  /** Loads the newest messages of the project's chat. A failure leaves the chat empty. */
  load(projectId: string): void {
    this.projectId = projectId;
    this._messages.set([]);
    this.realtimeSub?.unsubscribe();
    this.realtimeSub = this.realtime
      .watch<SessionSuggestionCodeMessage>(`projects/${projectId}/suggestions`)
      .subscribe((message) => {
        if (message?.type === 'SUGGESTION_CODE_UPDATED') {
          this.applyCodeUpdate(message.suggestionId, message.code);
        }
      });
    this.api.listAssistantMessages(projectId).subscribe({
      next: (messages) => {
        if (this.projectId === projectId) this._messages.set(messages);
      },
      error: () => undefined,
    });
  }

  /**
   * Sends a message; the reply (and any suggestions) is appended when it arrives. The caller
   * shows the error and restores the draft when the request fails.
   */
  send(content: string): Observable<AssistantExchangeResponse> {
    const projectId = this.projectId;
    const result = new ReplaySubject<AssistantExchangeResponse>(1);
    if (!projectId || this.sending()) {
      result.complete();
      return result.asObservable();
    }
    this._pendingQuestion.set(content);
    this.api
      .sendAssistantMessage(projectId, content)
      .pipe(
        tap((exchange) => {
          if (this.projectId === projectId) {
            this._messages.update((messages) =>
              appendExchange(messages, exchange.question, exchange.answer),
            );
          }
        }),
        finalize(() => this._pendingQuestion.set(null)),
      )
      .subscribe(result);
    return result.asObservable();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.realtimeSub?.unsubscribe();
      for (const sub of this.verifyTimers.values()) sub.unsubscribe();
    });
  }

  /**
   * Verifies one of the chat's suggestions in the pure source code. The card shows "verifying" at
   * once; the verdict arrives on the project's suggestions topic ({@link applyCodeUpdate}). A request
   * that fails, or a verdict that never arrives, leaves the card failed with a retry.
   */
  verifyCode(suggestion: SuggestionResponse): Observable<SuggestionResponse> {
    this.change(suggestion.id, startVerifying);
    this.watchVerification(suggestion.id);
    const result = new ReplaySubject<SuggestionResponse>(1);
    this.api
      .verifySuggestionCode(suggestion.projectId, suggestion.id)
      .pipe(
        tap((accepted) =>
          // The verdict may already have arrived: never step back to "verifying".
          this.change(suggestion.id, (current) =>
            verifyStateOf(current) === 'VERIFYING'
              ? withCodeUpdate(current, accepted.code ?? null)
              : current,
          ),
        ),
        catchError((error: unknown) => {
          this.stopWatching(suggestion.id);
          this.change(suggestion.id, (current) => failVerification(current));
          return throwError(() => error);
        }),
      )
      .subscribe(result);
    return result.asObservable();
  }

  /** What a realtime update says about the code of a chat suggestion (ignored when it is not here). */
  applyCodeUpdate(suggestionId: string, code: SuggestionCodeInsight | null): void {
    if (code?.verifyState === 'VERIFYING') this.watchVerification(suggestionId);
    else this.stopWatching(suggestionId);
    this.change(suggestionId, (current) => withCodeUpdate(current, code));
  }

  private change(
    suggestionId: string,
    change: (suggestion: SuggestionResponse) => SuggestionResponse,
  ): void {
    this._messages.update((messages) => updateReplySuggestion(messages, suggestionId, change));
  }

  private watchVerification(suggestionId: string): void {
    this.stopWatching(suggestionId);
    this.verifyTimers.set(
      suggestionId,
      timer(VERIFY_TIMEOUT_MS).subscribe(() => {
        this.verifyTimers.delete(suggestionId);
        this.change(suggestionId, (current) =>
          verifyStateOf(current) === 'VERIFYING' ? failVerification(current) : current,
        );
      }),
    );
  }

  private stopWatching(suggestionId: string): void {
    this.verifyTimers.get(suggestionId)?.unsubscribe();
    this.verifyTimers.delete(suggestionId);
  }

  /** Reflects a decision taken on one of the chat's suggestions. */
  applyDecision(updated: SuggestionResponse): void {
    this._messages.update((messages) => replaceSuggestion(messages, updated));
  }
}
