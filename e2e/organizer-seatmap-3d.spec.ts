import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3000';

async function login(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password: 'secret123' },
  });
  expect(res.ok()).toBeTruthy();
  const setCookie = res.headers()['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join('\n') : String(setCookie ?? '');
  const match = raw.match(/access_token=([^;]+)/);
  expect(match).toBeTruthy();
  return decodeURIComponent(match![1]);
}

async function loginViaUi(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'secret123');
  await page.click('.login-submit');
  await page.waitForURL(/\/(events|org|gate)(\?|$)/);
}

/** Filme é obrigatório no create: vitrine `.tmdb-card` ou card/botão com título. */
async function selectFirstCatalogMovie(page: Page) {
  const tmdbCard = page.locator('.tmdb-card').first();
  try {
    await tmdbCard.waitFor({ state: 'visible', timeout: 8000 });
    await tmdbCard.click();
  } catch {
    // vitrine vazia ou busca antiga — tenta o grid de resultados
    const search = page.locator('#org-search');
    if (await search.isVisible()) {
      await search.fill('Inception');
      await page.waitForResponse(
        (res) => res.url().includes('/api/catalog/search') && res.ok(),
        { timeout: 8000 },
      );
    }

    const movieCard = tmdbCard.or(
      page.getByRole('article').filter({ has: page.locator('h2') }).first(),
    );
    await movieCard.waitFor({ timeout: 15000 });
    await movieCard.click();
  }

  // Split pane: formulário ao lado (desktop) ou abaixo (mobile), sem scroll infinito nem modal.
  await expect(page.locator('#org-venue')).toBeVisible();
}

async function assertCatalogCompactedAndFormVisible(page: Page) {
  await expect(page.getByRole('button', { name: 'Trocar filme' })).toBeVisible();
  await expect(page.locator('.org-catalog-pane.is-compact')).toBeVisible();
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#org-venue')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar e publicar evento' })).toBeVisible();
}

test('organizador cria evento com assentos e ele aparece publicado', async ({ page }) => {
  await loginViaUi(page, 'org@eventos.local');

  await page.goto('/');
  await page.getByRole('link', { name: /Criar novo evento/ }).click();
  await page.waitForURL('**/org');

  await selectFirstCatalogMovie(page);
  await assertCatalogCompactedAndFormVisible(page);

  const title = `Sessão E2E ${Date.now()}`;
  await page.fill('#org-title', title);
  await page.fill('#org-venue', 'Sala E2E');
  await page.fill('#org-starts', '2030-01-15T20:00');
  await page.fill('#org-capacity', '12');
  await page.fill('#org-price', '35,00');
  await page.selectOption('#org-sale-mode', 'SEAT_MAP');
  await page.fill('#org-rows', '3');
  await page.fill('#org-cols', '4');

  await page.getByRole('button', { name: 'Criar e publicar evento' }).click();
  await page.waitForURL('**/events');

  const card = page.locator('.event-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText('Capacidade: 12 · Mapa de assentos')).toBeVisible();
});

test('após escolher filme o catálogo compacta e Trocar filme reabre a vitrine', async ({ page }) => {
  await loginViaUi(page, 'org@eventos.local');
  await page.goto('/org');

  await expect(page.getByRole('heading', { name: '1. Filme' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2. Sessão' })).toBeVisible();

  const publishCta = page.getByRole('button', { name: 'Criar e publicar evento' });
  await expect(publishCta).toBeDisabled();

  await selectFirstCatalogMovie(page);
  await assertCatalogCompactedAndFormVisible(page);
  await expect(publishCta).toBeEnabled();

  await page.getByRole('button', { name: 'Trocar filme' }).click();
  await expect(publishCta).toBeDisabled();
  await expect(page.locator('.org-catalog-pane.is-compact')).toHaveCount(0);

  await selectFirstCatalogMovie(page);
  await assertCatalogCompactedAndFormVisible(page);
  await expect(publishCta).toBeEnabled();
});

test('cliente seleciona assento no mapa 3D', async ({ page, request }) => {
  const token = await login(request, 'org@eventos.local');
  const created = await request.post(`${API}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: `Mapa 3D ${Date.now()}`,
      venue: 'Cine E2E',
      startsAt: '2030-02-20T23:00:00.000Z',
      capacity: 12,
      priceCents: 4000,
      saleMode: 'SEAT_MAP',
      rows: 3,
      cols: 4,
      tmdbId: 27205,
      posterUrl: 'https://picsum.photos/seed/inception/500/750',
    },
  });
  expect(created.ok()).toBeTruthy();
  const event = await created.json();
  const published = await request.post(`${API}/api/events/${event.id}/publish`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(published.ok()).toBeTruthy();

  await loginViaUi(page, 'cliente1@eventos.local');
  await page.goto(`/reserve?eventId=${event.id}`);
  await expect(page.locator('.seatmap3d canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Lista' }).click();
  await page.locator('div[aria-label="Mapa de assentos"]').waitFor();
  await page.getByRole('button', { name: 'A1', exact: true }).click();
  await expect(page.getByText(/Selecionados: A1 — R\$\s*40,00/)).toBeVisible();

  await page.getByRole('button', { name: 'A2', exact: true }).click();
  await expect(page.getByText(/Selecionados: A1, A2 — R\$\s*80,00/)).toBeVisible();

  await page.getByRole('button', { name: 'Continuar para pagamento' }).click();
  await page.waitForURL('**/checkout?reservationIds=**');
  await expect(page.getByText('Assentos A1')).toBeVisible();
});

test('seleção por clique no canvas 3D funciona (raycast)', async ({ page, request }) => {
  const token = await login(request, 'org@eventos.local');
  const created = await request.post(`${API}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: `Raycast ${Date.now()}`,
      venue: 'Cine Raycast',
      startsAt: '2030-03-10T23:00:00.000Z',
      capacity: 40,
      priceCents: 5000,
      saleMode: 'SEAT_MAP',
      rows: 5,
      cols: 8,
      tmdbId: 27205,
      posterUrl: 'https://picsum.photos/seed/inception/500/750',
    },
  });
  const event = await created.json();
  await request.post(`${API}/api/events/${event.id}/publish`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await loginViaUi(page, 'cliente2@eventos.local');
  await page.goto(`/reserve?eventId=${event.id}`);

  const canvas = page.locator('.seatmap3d canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;

  // Alguns pontos no miolo da plateia; o primeiro que acertar um assento resolve o teste.
  const candidates = [
    [0.5, 0.62],
    [0.45, 0.55],
    [0.55, 0.7],
    [0.5, 0.5],
  ];

  for (const [fx, fy] of candidates) {
    const x = box.x + box.width * fx;
    const y = box.y + box.height * fy;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    if (await page.getByText(/^Selecionados: /).isVisible().catch(() => false)) break;
  }

  await expect(page.getByText(/Selecionados: [A-E]\d+ — R\$\s*50,00/)).toBeVisible();
});
