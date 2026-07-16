import type { Particle } from "./animations";

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
