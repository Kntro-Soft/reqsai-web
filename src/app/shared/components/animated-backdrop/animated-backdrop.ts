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
    <div #blob class="ab-blob ab-blob-a" data-follow="true"></div>
    <!-- Blob B: navy tint, drifts from bottom-right (opposite parallax sign). -->
    <div #blob class="ab-blob ab-blob-b" data-fx="-58" data-fy="-64"></div>
    <!-- Blob C: faint brand, bottom-left, gentlest. -->
    <div #blob class="ab-blob ab-blob-c" data-fx="46" data-fy="-40"></div>
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
        opacity: 0.65;
        -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, black, transparent 75%);
        mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, black, transparent 75%);
      }
      /* Light mode reads flat, so bump the grid a touch (still tasteful). */
      :root:not(.dark) .ab-grid {
        opacity: 0.9;
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
        top: 0;
        left: 0;
        height: 34rem;
        width: 34rem;
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.26), transparent 70%);
        filter: blur(60px);
        /* Follows the cursor (centred on it); the rAF loop sets --rx/--ry. Fallback: centred. */
        transform: translate3d(var(--rx, calc(50vw - 50%)), var(--ry, calc(42vh - 50%)), 0);
      }
      /* Blob B — navy tint, bottom right. */
      .ab-blob-b {
        right: -6rem;
        bottom: -10rem;
        height: 24rem;
        width: 24rem;
        background: radial-gradient(closest-side, rgba(56, 89, 148, 0.32), transparent 70%);
        filter: blur(52px);
      }
      /* Blob C — faint brand, bottom left. */
      .ab-blob-c {
        bottom: -6rem;
        left: -6rem;
        height: 18rem;
        width: 18rem;
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.16), transparent 70%);
        filter: blur(46px);
      }

      /* Light mode: slightly stronger glow alpha so it doesn't wash out. */
      :root:not(.dark) .ab-blob-a {
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.2), transparent 70%);
      }
      :root:not(.dark) .ab-blob-b {
        background: radial-gradient(closest-side, rgba(56, 89, 148, 0.22), transparent 70%);
      }
      :root:not(.dark) .ab-blob-c {
        background: radial-gradient(closest-side, rgba(239, 68, 68, 0.14), transparent 70%);
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
    const el = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('.ab-blob'));
    if (nodes.length === 0) return;

    const blobs = nodes.map((node) => ({
      node,
      follow: node.dataset['follow'] === 'true',
      fx: Number(node.dataset['fx'] ?? 0),
      fy: Number(node.dataset['fy'] ?? 0),
      w: node.offsetWidth,
      h: node.offsetHeight,
      cur: { x: 0, y: 0 },
    }));

    // Fully static under reduced-motion: no listeners, no rAF — just centre the follow blob.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const b of blobs) {
        if (!b.follow) continue;
        b.node.style.setProperty('--rx', `${(innerWidth - b.w) / 2}px`);
        b.node.style.setProperty('--ry', `${(innerHeight - b.h) / 2}px`);
      }
      return;
    }

    const amp = this.intensity();
    // Start the follow blob at the viewport centre so it eases in instead of flying from a corner.
    for (const b of blobs) {
      if (b.follow) b.cur = { x: (innerWidth - b.w) / 2, y: (innerHeight - b.h) / 2 };
    }

    let pointerX = innerWidth / 2;
    let pointerY = innerHeight / 2;
    let lastMove = 0;
    let hasPointer = false;
    const IDLE_MS = 2000;
    // When the pointer leaves / goes idle, roam from the light's current spot (not a fixed path).
    let idlePrev = false;
    let idleAnchorX = 0;
    let idleAnchorY = 0;
    let idleStart = 0;

    const onMove = (e: MouseEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      lastMove = performance.now();
      hasPointer = true;
    };
    document.addEventListener('mousemove', onMove, { passive: true });

    let rafId = 0;
    const tick = (now: number) => {
      const idle = !hasPointer || now - lastMove > IDLE_MS;
      const t = now / 1000;
      const vw = innerWidth || 1;
      const vh = innerHeight || 1;

      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        let goalX: number;
        let goalY: number;

        if (b.follow) {
          let cx: number;
          let cy: number;
          if (idle) {
            // On going idle, anchor the roam at the light's CURRENT centre so it keeps drifting
            // from where it is instead of snapping toward a far point.
            if (!idlePrev) {
              idleAnchorX = b.cur.x + b.w / 2;
              idleAnchorY = b.cur.y + b.h / 2;
              idleStart = now;
            }
            // Ease the anchor toward centre so it never wanders off-screen — but it starts exactly
            // at the light's current spot (no clamp jump) and migrates gently.
            idleAnchorX += (vw / 2 - idleAnchorX) * 0.004;
            idleAnchorY += (vh / 2 - idleAnchorY) * 0.004;
            const e = (now - idleStart) / 1000;
            // Both axes use sin so the offset starts at 0 (cos starts at its max → a jump).
            cx = idleAnchorX + Math.sin(e * 0.33) * vw * 0.18;
            cy = idleAnchorY + Math.sin(e * 0.24) * vh * 0.18;
          } else {
            cx = pointerX;
            cy = pointerY;
          }
          goalX = cx - b.w / 2;
          goalY = cy - b.h / 2;
          b.cur.x += (goalX - b.cur.x) * 0.09;
          b.cur.y += (goalY - b.cur.y) * 0.09;
        } else if (idle) {
          // Ambient blobs: gentle self-drift, phase-shifted per blob.
          const phase = i * 1.7;
          goalX = Math.sin(t * 0.24 + phase) * 95 * amp;
          goalY = Math.cos(t * 0.2 + phase) * 72 * amp;
          b.cur.x += (goalX - b.cur.x) * 0.06;
          b.cur.y += (goalY - b.cur.y) * 0.06;
        } else {
          // Ambient blobs: slight opposite parallax for depth behind the follow light.
          const nx = (pointerX / vw) * 2 - 1;
          const ny = (pointerY / vh) * 2 - 1;
          goalX = nx * b.fx * amp;
          goalY = ny * b.fy * amp;
          b.cur.x += (goalX - b.cur.x) * 0.06;
          b.cur.y += (goalY - b.cur.y) * 0.06;
        }

        b.node.style.setProperty('--rx', `${b.cur.x.toFixed(2)}px`);
        b.node.style.setProperty('--ry', `${b.cur.y.toFixed(2)}px`);
      }

      idlePrev = idle;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMove);
    });
  }
}
