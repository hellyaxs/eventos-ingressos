import { PrismaClient, Role, SaleMode } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'secret123';

const SEED_EVENT_EXTERNAL_REF = 'tmdb:155';
const SEED_EVENT_ROWS = 8;
const SEED_EVENT_COLS = 10;

const users: Array<{ email: string; name: string; role: Role }> = [
  { email: 'org@eventos.local', name: 'Organizador Demo', role: 'ORGANIZER' },
  { email: 'cliente1@eventos.local', name: 'Cliente Um', role: 'CLIENT' },
  { email: 'cliente2@eventos.local', name: 'Cliente Dois', role: 'CLIENT' },
  { email: 'gate@eventos.local', name: 'Portaria Demo', role: 'GATE' },
];

function buildSeats(rows: number, cols: number) {
  const seats: Array<{ label: string; row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    const letter = String.fromCharCode('A'.charCodeAt(0) + r);
    for (let c = 1; c <= cols; c++) {
      seats.push({ label: `${letter}${c}`, row: r + 1, col: c });
    }
  }
  return seats;
}

async function seedEvent(organizerId: string) {
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const capacity = SEED_EVENT_ROWS * SEED_EVENT_COLS;

  const existing = await prisma.event.findFirst({
    where: {
      OR: [
        { externalRef: SEED_EVENT_EXTERNAL_REF },
        { externalRef: 'tmdb-fallback-demo' },
      ],
    },
  });

  const data = {
    organizerId,
    title: 'Showcase de Verão',
    venue: 'Arena Demo',
    startsAt,
    capacity,
    priceCents: 10000,
    saleMode: SaleMode.SEAT_MAP,
    status: 'PUBLISHED' as const,
    rows: SEED_EVENT_ROWS,
    cols: SEED_EVENT_COLS,
    posterUrl: 'https://picsum.photos/seed/dark-knight/500/750',
    externalRef: SEED_EVENT_EXTERNAL_REF,
    tmdbId: 155,
  };

  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data })
    : await prisma.event.create({ data });

  if (existing) {
    console.log(
      `Seeded event: ${event.title} (${SEED_EVENT_EXTERNAL_REF}) — already exists, seats untouched`,
    );
    return;
  }

  await prisma.seat.createMany({
    data: buildSeats(SEED_EVENT_ROWS, SEED_EVENT_COLS).map((seat) => ({
      ...seat,
      eventId: event.id,
    })),
  });
  console.log(
    `Seeded event: ${event.title} (${SEED_EVENT_EXTERNAL_REF}) with ${capacity} seats`,
  );
}

async function main() {
  const passwordHash = hashSync(DEMO_PASSWORD, 10);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
    console.log(`Seeded user: ${user.email} (${user.role})`);
  }

  const organizer = await prisma.user.findUnique({
    where: { email: 'org@eventos.local' },
  });
  if (!organizer) {
    throw new Error('Organizador org@eventos.local não encontrado após seed');
  }
  await seedEvent(organizer.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
