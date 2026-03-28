import { type Browser, chromium } from 'playwright';

const URL = 'https://hats.labs.vercel.dev/';
const INSTANCES = parseInt(process.argv[2] || '24', 10);
const FREE_SHIPPING_PURCHASE_RATE = 0.9;
const NO_FREE_SHIPPING_PURCHASE_RATE = 0.1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInstance(browser: Browser, id: number) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Visit the shop
    await page.goto(URL, { waitUntil: 'networkidle' });
    console.log(`[${id}] Loaded shop`);
    await sleep(1000);

    // Pick a random hat and click "Add to Cart"
    const addButtons = page.locator('button', { hasText: 'Add to Cart' });
    const count = await addButtons.count();
    if (count === 0) {
      console.log(`[${id}] No hats available to add`);
      return;
    }
    const randomIndex = Math.floor(Math.random() * count);
    await addButtons.nth(randomIndex).click();

    // Wait for navigation to /checkout
    await page.waitForURL('**/checkout', { timeout: 15000 });
    console.log(`[${id}] On checkout page`);
    await sleep(1500);

    // Check for "Free shipping" text
    const freeShipping = await page
      .locator('text=Free shipping')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    const purchaseRate = freeShipping
      ? FREE_SHIPPING_PURCHASE_RATE
      : NO_FREE_SHIPPING_PURCHASE_RATE;

    const shouldPurchase = Math.random() < purchaseRate;

    console.log(
      `[${id}] Free shipping: ${freeShipping}, Purchase rate: ${purchaseRate * 100}%, Will purchase: ${shouldPurchase}`,
    );

    await sleep(1000);

    if (shouldPurchase) {
      await page.locator('button', { hasText: 'Complete Purchase' }).click();
      await page.waitForSelector('text=Order Confirmed', { timeout: 10000 });
      console.log(`[${id}] Purchase completed`);
    } else {
      console.log(`[${id}] Skipped purchase`);
    }

    // Pause briefly so the result is visible
    await sleep(2000);
  } catch (err) {
    console.error(`[${id}] Error:`, (err as Error).message);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  console.log(`Launching ${INSTANCES} instances...`);

  const promises = Array.from({ length: INSTANCES }, (_, i) =>
    runInstance(browser, i + 1),
  );
  await Promise.all(promises);

  await browser.close();
  console.log('Done.');
}

main();
