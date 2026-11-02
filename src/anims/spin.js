// Turntable angle at time t (seconds).
// loop: constant speed; the frame after the last is frame 0 again, so the clip loops seamlessly.
// otherwise: ease-in-out, and the last frame lands exactly on 360°.
export function spinAngle(t, look) {
  const frames = Math.max(2, Math.round(look.seconds * look.fps));
  if (look.loop) return (Math.PI * 2 * t) / look.seconds;
  const p = Math.min(1, Math.max(0, t / ((frames - 1) / look.fps)));
  return Math.PI * 2 * (0.5 - 0.5 * Math.cos(Math.PI * p));
}
