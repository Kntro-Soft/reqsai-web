import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
} from '@angular/core';

/**
 * Decorative, aria-hidden ambient backdrop: the app's signature faint grid plus
 * two or three soft radial brand/navy glow blobs — but alive.
 *
 * The blobs react to the pointer (a subtle parallax, each blob at its own factor
 * and sign) and, when the pointer has been idle for ~2s or there is no pointer at
 * all (touch), drift on their own along slow looping sine/cosine paths. Everything
 * is driven by a single `requestAnimationFrame` loop that only writes `transform`
 * (translate) on the blobs — GPU-friendly, no layout thrash — and lerps toward the
 * target each frame for smooth easing.
 *
 * Under `prefers-reduced-motion: reduce` no listeners or rAF are installed and the
 * blobs render in their static rest position.
 */
@Component({
  selector: 'app-animated-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    class: 'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
  },
  template: `
    @if (showGrid()) {
      <div class="ab-grid absolute inset-0"></div>
    }

    <!-- Blob A: brand red, drifts from top-centre. -->
    <div #blob class="ab-blob ab-blob-a" data-fx="8" data-fy="7"></div>
    <!-- Blob B: navy tint, drifts from bottom-right (opposite parallax sign). -->
    <div #blob class="ab-blob ab-blob-b" data-fx="-5" data-fy="-6"></div>
    <!-- Blob C: faint brand, bottom-left, gentlest. -->
    <div #blob class="ab-blob ab-blob-c" data-fx="4" data-fy="-3"></div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Signature faint grid, masked to fade at the edges (matches the onboarding look). */
      .ab-grid {
        background-image:
          linear-gradient(to right, var(--border) 1px, transparent 1px),
          linear-gradient(to bottom, var(--border) 1px, transparent 1px);
        background-size: 44px 44px;
        opacity: 0.5;
        -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 72%);
        mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 72%);
      }
      /* Light mode reads flat, so bump the grid a touch (still tasteful). */
      :root:not(.dark) .ab-grid {
        opacity: 0.7;
      }

      .ab-blob {
        position: absolute;
        border-radius: 9999px;
        will-change: transform;
        /* The per-blob base placement is set with translate; the rAF loop overrides
         * the whole transform each frame, so we keep the resting offset in a var. */
        transform: translate3d(var(--rx, 0), var(--ry, 0), 0);
      }

      /* Blob A — brand red, top centre. */
      .ab-blob-a {
        top: -8rem;
        left: 50%;
        height: 22rem;
        width: 40rem;
        margin-left: -20rem;
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.16), transparent 70%);
        filter: blur(64px);
      }
      /* Blob B — navy tint, bottom right. */
      .ab-blob-b {
        right: -6rem;
        bottom: -10rem;
        height: 24rem;
        width: 24rem;
        background: radial-gradient(closest-side, rgba(56, 89, 148, 0.22), transparent 70%);
        filter: blur(56px);
      }
      /* Blob C — faint brand, bottom left. */
      .ab-blob-c {
        bottom: -6rem;
        left: -6rem;
        height: 18rem;
        width: 18rem;
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.1), transparent 70%);
        filter: blur(48px);
      }

      /* Light mode: slightly stronger glow alpha so it doesn't wash out. */
      :root:not(.dark) .ab-blob-a {
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.14), transparent 70%);
      }
      :root:not(.dark) .ab-blob-b {
        background: radial-gradient(closest-side, rgba(56, 89, 148, 0.16), transparent 70%);
      }
      :root:not(.dark) .ab-blob-c {
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.1), transparent 70%);
      }

      @media (prefers-reduced-motion: reduce) {
        .ab-blob {
          will-change: auto;
        }
      }
    `,
  ],
})
export class AnimatedBackdrop {
  /** Toggle the faint grid layer (default on). */
  readonly showGrid = input(true);
  /**
   * Overall motion intensity multiplier (parallax reach + drift amplitude).
   * Default is deliberately subtle; bump slightly for more life.
   */
  readonly intensity = input(1);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.setup());
  }

  private setup(): void {
    // Fully static under reduced-motion: no listeners, no rAF.
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const el = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('.ab-blob'));
    const blobs = nodes.map((node) => ({
      node,
      fx: Number(node.dataset['fx'] ?? 0),
      fy: Number(node.dataset['fy'] ?? 0),
      cur: { x: 0, y: 0 },
    }));
    if (blobs.length === 0) return;

    const amp = this.intensity();
    // Pointer target as an offset from viewport centre, normalized to [-1, 1].
    let targetX = 0;
    let targetY = 0;
    let lastMove = 0; // timestamp of the last real pointer movement
    let hasPointer = false;
    const IDLE_MS = 2000;

    const onMove = (e: MouseEvent) => {
      const w = innerWidth || 1;
      const h = innerHeight || 1;
      targetX = (e.clientX / w) * 2 - 1;
      targetY = (e.clientY / h) * 2 - 1;
      lastMove = performance.now();
      hasPointer = true;
    };
    document.addEventListener('mousemove', onMove, { passive: true });

    let rafId = 0;
    const tick = (now: number) => {
      const idle = !hasPointer || now - lastMove > IDLE_MS;
      const t = now / 1000;

      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        let goalX: number;
        let goalY: number;

        if (idle) {
          // Gentle self-drift: slow looping sine/cosine, phase-shifted per blob.
          const phase = i * 1.7;
          goalX = Math.sin(t * 0.18 + phase) * 26 * amp;
          goalY = Math.cos(t * 0.15 + phase) * 20 * amp;
        } else {
          // Parallax: translate by a small factor of the cursor offset.
          goalX = targetX * b.fx * amp;
          goalY = targetY * b.fy * amp;
        }

        // Ease toward the goal (lerp) for smooth transitions in both modes.
        b.cur.x += (goalX - b.cur.x) * 0.06;
        b.cur.y += (goalY - b.cur.y) * 0.06;
        b.node.style.setProperty('--rx', `${b.cur.x.toFixed(2)}px`);
        b.node.style.setProperty('--ry', `${b.cur.y.toFixed(2)}px`);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMove);
    });
  }
}
