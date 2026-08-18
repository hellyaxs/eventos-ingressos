import { expect, test } from '@playwright/test';

const API = 'http://localhost:3000';
const TICKET_CODE_RE = /^CENA-[0-9A-F]{4}(-[0-9A-F]{4}){5}$/;
const SHARE_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.setTimeout(60000);

test('happy path: reserve → checkout → tickets → share → gate', async ({ page, request }) => {
  const eventsRes = await request.get(`${API}/api/events`);
  expect(eventsRes.ok()).toBeTruthy();
  const eventsPayload = await eventsRes.json();
  const events = Array.isArray(eventsPayload)
    ? eventsPayload
    : (eventsPayload.items ?? eventsPayload.data ?? []);
  const event = events.find(
    (e: { saleMode: string }) => e.saleMode === 'SEAT_MAP',
  );
  expect(event).toBeTruthy();

  const seatsRes = await request.get(`${API}/api/events/${event.id}/seats`);
  expect(seatsRes.ok()).toBeTruthy();
  const seatMap = await seatsRes.json();
  const seat =
    seatMap.seats.find((s: any) => s.label === 'A1' && s.available) ??
    seatMap.seats.find((s: any) => s.available);
  expect(seat, 'at least one seat must be available (re-seed if the demo event is full)').toBeTruthy();

  await page.goto('/login');
  await page.fill('#login-email', 'cliente1@eventos.local');
  await page.fill('#login-password', 'secret123');
  await page.click('.login-submit');
  await page.waitForURL('**/events');

  await page.goto(`/reserve?eventId=${event.id}`);
  await page.getByRole('button', { name: 'Lista' }).click();
  await page.locator('div[aria-label="Mapa de assentos"]').waitFor();
  await page.getByRole('button', { name: seat.label, exact: true }).click();
  await expect(
    page.getByText(`Selecionados: ${seat.label} — R$ 100,00`),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continuar para pagamento' }).click();
  await page.waitForURL('**/checkout?reservationIds=**');

  await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
  await expect(page.getByText(`Assentos ${seat.label}`)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(
    page.getByText(/não é possível comprar estes ingressos de novo/),
  ).toBeVisible();

  const ticketCode = (await page.getByText(TICKET_CODE_RE).first().textContent())!.trim();
  expect(TICKET_CODE_RE.test(ticketCode)).toBeTruthy();

  const ticketsCta = page.getByRole('link', { name: 'Ver ingressos' });
  await expect(ticketsCta).toHaveAttribute('href', '/tickets?justPaid=1');
  await ticketsCta.click();
  await page.waitForURL(/\/tickets(\?|$)/);

  const article = page.locator('article').filter({ hasText: ticketCode });
  await expect(article).toBeVisible();
  await expect(article.getByText('Showcase de Verão')).toBeVisible();
  await expect(article.getByText('ISSUED')).toBeVisible();
  await expect(article.locator('img[alt^="QR do código"]')).toBeVisible();
  await expect(article.getByRole('button', { name: 'Copiar link' })).toBeVisible();
  await expect(article.getByRole('link', { name: /Abrir share/ })).toBeVisible();

  const shareHref = await article.getByRole('link', { name: /Abrir share/ }).getAttribute('href');
  expect(shareHref).toBeTruthy();
  const shareToken = shareHref!.split('/share/').pop()!;
  expect(SHARE_TOKEN_RE.test(shareToken)).toBeTruthy();

  await page.goto(`/share/${shareToken}`);
  await expect(page.getByText('✓ Ingresso válido')).toBeVisible();
  await expect(page.getByText('Showcase de Verão')).toBeVisible();
  await expect(page.getByText(`Assento ${seat.label}`)).toBeVisible();

  await page.goto('/gate');
  await page.selectOption('#gate-event', String(event.id));
  await page.fill('#gate-code', ticketCode);
  await page.getByRole('button', { name: 'Validar ingresso' }).click();
  await expect(page.getByText('✓ Ingresso válido')).toBeVisible();
});
