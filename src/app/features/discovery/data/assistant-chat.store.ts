import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, finalize, tap } from 'rxjs';
import { DiscoveryApiService } from './discovery-api.service';
import {
  AssistantExchangeResponse,
  AssistantMessageResponse,
  SuggestionResponse,
} from './discovery.models';
import { appendExchange, replaceSuggestion } from './assistant-chat';

/**
 * State of the project's assistant chat on the capture page: the conversation, the message being
 * answered and the review state of the suggestions the replies raised. Decisions themselves go
 * through {@link DiscoveryChatStore.decide} (which also refreshes the backlog); the page hands the
 * resolved suggestion back here with {@link applyDecision}.
 */
@Injectable()
export class AssistantChatStore {
  private readonly api = inject(DiscoveryApiService);

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

  /** Reflects a decision taken on one of the chat's suggestions. */
  applyDecision(updated: SuggestionResponse): void {
    this._messages.update((messages) => replaceSuggestion(messages, updated));
  }
}
