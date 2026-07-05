import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { DiscoveryChatStore, MOCK_SUGGESTION_PREFIX } from './discovery-chat.store';
import {
  AcceptanceCriterion,
  SuggestionPriority,
  SuggestionResponse,
  SuggestionType,
} from './discovery.models';

/**
 * DEV-ONLY mock suggestion generator. When enabled, injects a random suggestion
 * of a random type into the decision queue every {@link INTERVAL_MS}, using
 * realistic Spanish sample content, so the suggestion review UX can be previewed
 * without a live recording session or any backend.
 *
 * Strictly dev-gated: {@link enabled} refuses to turn on when
 * `environment.production` is true, and generated ids carry the
 * {@link MOCK_SUGGESTION_PREFIX} so the store resolves accept/dismiss locally,
 * never issuing an HTTP call. This whole file is disposable — delete it and its
 * single call site in the page to remove the feature.
 */
@Injectable({ providedIn: 'root' })
export class MockSuggestionService {
  private readonly store = inject(DiscoveryChatStore);

  /** Emit interval; kept short enough to see several suggestions quickly. */
  private static readonly INTERVAL_MS = 5000;

  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 0;
  private sessionId = `${MOCK_SUGGESTION_PREFIX}session`;

  /** Whether the generator is currently running (drives the dev toggle button). */
  readonly running = signal(false);

  /** True only outside production — the toggle/param must never expose this in prod. */
  readonly available = !environment.production;

  /** Starts the periodic generator (no-op in production or if already running). */
  start(): void {
    if (!this.available || this.timer !== null) return;
    this.running.set(true);
    // Emit one immediately so the effect is visible without waiting a full tick.
    this.emit();
    this.timer = setInterval(() => this.emit(), MockSuggestionService.INTERVAL_MS);
  }

  /** Stops the generator; pending mock cards stay until decided. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running.set(false);
  }

  /** Flips the generator on/off (bound to the dev toggle button). */
  toggle(): void {
    if (this.running()) this.stop();
    else this.start();
  }

  /** Builds one random mock suggestion and pushes it into the queue. */
  private emit(): void {
    const suggestion = this.randomSuggestion();
    this.store.enqueueMock(suggestion);
  }

  private randomSuggestion(): SuggestionResponse {
    const types: SuggestionType[] = [
      'NEW_STORY',
      'UPDATE_STORY',
      'EDGE_CASE',
      'CLARIFYING_QUESTION',
    ];
    const type = pick(types);
    switch (type) {
      case 'UPDATE_STORY':
        return this.updateStory();
      case 'EDGE_CASE':
        return this.edgeCase();
      case 'CLARIFYING_QUESTION':
        return this.clarifyingQuestion();
      default:
        return this.newStory();
    }
  }

  private base(type: SuggestionType): SuggestionResponse {
    const now = new Date().toISOString();
    return {
      id: `${MOCK_SUGGESTION_PREFIX}${Date.now()}-${this.counter++}`,
      sessionId: this.sessionId,
      projectId: `${MOCK_SUGGESTION_PREFIX}project`,
      type,
      status: 'PENDING',
      draftTitle: null,
      draftRole: null,
      draftAction: null,
      draftBenefit: null,
      draftPriority: null,
      draftStoryPoints: null,
      relatedTopic: null,
      targetStoryId: null,
      question: null,
      resolvedStoryId: null,
      draftAcceptanceCriteria: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private newStory(): SuggestionResponse {
    const sample = pick(NEW_STORIES);
    return {
      ...this.base('NEW_STORY'),
      draftTitle: sample.title,
      draftRole: sample.role,
      draftAction: sample.action,
      draftBenefit: sample.benefit,
      draftPriority: pick(PRIORITIES),
      draftStoryPoints: pick([2, 3, 5, 8]),
      relatedTopic: sample.topic,
      // 2-3 draft acceptance criteria.
      draftAcceptanceCriteria: sample.criteria,
    };
  }

  private updateStory(): SuggestionResponse {
    const sample = pick(UPDATE_STORIES);
    return {
      ...this.base('UPDATE_STORY'),
      draftTitle: sample.title,
      draftRole: sample.role,
      draftAction: sample.action,
      draftBenefit: sample.benefit,
      draftPriority: pick(PRIORITIES),
      draftStoryPoints: pick([3, 5, 8]),
      relatedTopic: sample.topic,
      // Target a real loaded story when one exists, else a mock placeholder id.
      targetStoryId: this.randomTargetStoryId(),
    };
  }

  private edgeCase(): SuggestionResponse {
    const sample = pick(EDGE_CASES);
    return {
      ...this.base('EDGE_CASE'),
      draftPriority: pick(PRIORITIES),
      relatedTopic: sample.topic,
      targetStoryId: this.randomTargetStoryId(),
      // Exactly one criterion for an edge case.
      draftAcceptanceCriteria: [sample.criterion],
    };
  }

  private clarifyingQuestion(): SuggestionResponse {
    return {
      ...this.base('CLARIFYING_QUESTION'),
      question: pick(QUESTIONS),
    };
  }

  /** A real loaded story id (so the target resolves), or a mock placeholder. */
  private randomTargetStoryId(): string {
    const stories = this.store.projectStories();
    if (stories.length > 0) return pick(stories).id;
    return `${MOCK_SUGGESTION_PREFIX}story-${this.counter}`;
  }
}

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Uniform random pick from a non-empty array. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

interface StorySample {
  title: string;
  role: string;
  action: string;
  benefit: string;
  topic: string;
  criteria: AcceptanceCriterion[];
}

const NEW_STORIES: StorySample[] = [
  {
    title: 'Exportar reporte de ventas',
    role: 'analista de negocio',
    action: 'exportar el reporte de ventas mensual a Excel',
    benefit: 'compartirlo con la dirección sin copiar datos a mano',
    topic: 'Reportes',
    criteria: [
      {
        scenario: 'Exportación exitosa',
        given: 'que hay ventas registradas en el mes',
        when: 'el analista pulsa "Exportar a Excel"',
        then: 'se descarga un archivo .xlsx con todas las filas del mes',
      },
      {
        scenario: 'Mes sin ventas',
        given: 'que el mes seleccionado no tiene ventas',
        when: 'el analista pulsa "Exportar a Excel"',
        then: 'se descarga un archivo con solo los encabezados',
      },
      {
        given: 'que la exportación tarda más de 10 segundos',
        when: 'el proceso sigue en curso',
        then: 'se muestra un indicador de progreso',
      },
    ],
  },
  {
    title: 'Recuperar contraseña por correo',
    role: 'usuario registrado',
    action: 'restablecer mi contraseña desde un enlace enviado a mi correo',
    benefit: 'recuperar el acceso sin contactar a soporte',
    topic: 'Autenticación',
    criteria: [
      {
        scenario: 'Enlace válido',
        given: 'que el usuario solicitó recuperar su contraseña',
        when: 'abre el enlace del correo dentro de 30 minutos',
        then: 'puede definir una nueva contraseña',
      },
      {
        scenario: 'Enlace expirado',
        given: 'que han pasado más de 30 minutos',
        when: 'el usuario abre el enlace',
        then: 'se le informa que el enlace expiró y puede solicitar otro',
      },
    ],
  },
  {
    title: 'Filtrar pedidos por estado',
    role: 'operador de almacén',
    action: 'filtrar la lista de pedidos por su estado',
    benefit: 'priorizar los pedidos pendientes de envío',
    topic: 'Pedidos',
    criteria: [
      {
        given: 'que existen pedidos en varios estados',
        when: 'el operador elige el estado "Pendiente"',
        then: 'la lista muestra solo los pedidos pendientes',
      },
      {
        given: 'que no hay pedidos en el estado elegido',
        when: 'el operador aplica el filtro',
        then: 'se muestra un mensaje de "Sin resultados"',
      },
    ],
  },
];

const UPDATE_STORIES: StorySample[] = [
  {
    title: 'Exportar reporte de ventas en PDF y Excel',
    role: 'analista de negocio',
    action: 'elegir entre exportar el reporte a Excel o a PDF',
    benefit: 'enviar el formato que cada área prefiere',
    topic: 'Reportes',
    criteria: [],
  },
  {
    title: 'Filtrar pedidos por estado y fecha',
    role: 'operador de almacén',
    action: 'combinar el filtro de estado con un rango de fechas',
    benefit: 'encontrar los pedidos pendientes de un día concreto',
    topic: 'Pedidos',
    criteria: [],
  },
];

interface EdgeCaseSample {
  topic: string;
  criterion: AcceptanceCriterion;
}

const EDGE_CASES: EdgeCaseSample[] = [
  {
    topic: 'Autenticación',
    criterion: {
      scenario: 'Correo no registrado',
      given: 'que se ingresa un correo que no existe',
      when: 'el usuario solicita recuperar la contraseña',
      then: 'se muestra el mismo mensaje neutro para no revelar cuentas',
    },
  },
  {
    topic: 'Reportes',
    criterion: {
      scenario: 'Volumen muy alto',
      given: 'que el reporte supera las 100.000 filas',
      when: 'el analista exporta a Excel',
      then: 'la exportación se procesa en segundo plano y avisa al terminar',
    },
  },
  {
    topic: 'Pedidos',
    criterion: {
      scenario: 'Pedido cancelado durante el envío',
      given: 'que un pedido en preparación se cancela',
      when: 'el operador refresca la lista',
      then: 'el pedido desaparece de la cola de envíos',
    },
  },
];

const QUESTIONS: string[] = [
  '¿Qué monedas debe soportar la exportación del reporte?',
  '¿Cuánto tiempo debe permanecer válido el enlace de recuperación?',
  '¿Quién puede cancelar un pedido una vez que está en preparación?',
  '¿El filtro de pedidos debe recordar la última selección del usuario?',
  '¿Se requiere autenticación de dos factores para usuarios administradores?',
];
