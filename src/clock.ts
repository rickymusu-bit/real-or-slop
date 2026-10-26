// A display clock only. The server alone accepts/rejects answers.
export function serverCountdown(expiresAt: number, serverNow: number, now = () => performance.now()) {
  const anchor = now();
  return () => Math.max(0, Math.ceil((expiresAt - serverNow - (now() - anchor)) / 1000));
}
