import { test as base, expect, Page } from '@playwright/test';

// Shared fixture: names every test's evidence after its persona and captures a final screenshot.
// Test titles follow "#<issue> AC<n>: <what it proves>" so evidence maps back to acceptance criteria.
export const test = base.extend<{ app: AppNav }>({
  app: async ({ page }, use, testInfo) => {
    testInfo.annotations.push({ type: 'persona', description: String(testInfo.project.metadata?.persona ?? testInfo.project.name) });
    await use(new AppNav(page));
    await testInfo.attach('final-screen', { body: await page.screenshot(), contentType: 'image/png' });
  },
});
export { expect };

// Thin page helpers for standard Lightning pages. Locators use roles and accessible names only.
export class AppNav {
  constructor(readonly page: Page) {}

  async openObjectHome(objectApiName: string) {
    await this.page.goto(`/lightning/o/${objectApiName}/list?filterName=Recent`);
    await this.page.waitForURL(new RegExp(`/lightning/o/${objectApiName}/`));
  }

  newButton() {
    return this.page.getByRole('button', { name: 'New', exact: true });
  }
}
