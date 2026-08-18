import { createHash, createHmac } from 'crypto';

export function buildCode(
  eventId: string,
  paymentId: string,
  seatLabel: string,
  secret: string,
): string {
  const hex = createHmac('sha256', secret)
    .update(`${eventId}|${paymentId}|${seatLabel}`)
    .digest('hex')
    .toUpperCase()
    .slice(0, 24);
  const groups = hex.match(/.{4}/g) ?? [];
  return `CENA-${groups.join('-')}`;
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
