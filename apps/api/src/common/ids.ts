import { BadRequestException, NotFoundException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export function parseUuid(id: string, notFoundMessage: string): string {
  if (!isUuid(id)) {
    throw new NotFoundException(notFoundMessage);
  }
  return id.trim();
}

export function parseSeatId(raw: string): bigint {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException('Assento não pertence a este evento');
  }
  return BigInt(value);
}

export function seatIdToString(id: bigint): string {
  return id.toString();
}
