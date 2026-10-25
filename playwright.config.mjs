import { defineConfig } from '@playwright/test';

const browser = process.env.JELLYTV_BROWSER || 'chrome';
const browsers = {
  chrome: { browserName: 'chromium', launchOptions: { executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } },
  edge: { browserName: 'chromium', channel: 'msedge' },
  chromium: { browserName: 'chromium' },
  firefox: { browserName: 'firefox' },
  webkit: { browserName: 'webkit' }
};
if (!browsers[browser]) throw new Error(`Unsupported validation browser: ${browser}`);

const resolutions = [
  ['desktop-1080', 1920, 1080], ['desktop-1440', 2560, 1440], ['desktop-4k', 3840, 2160],
  ['laptop', 1366, 768], ['tablet-portrait', 768, 1024], ['tablet-landscape', 1024, 768],
  ['mobile-320', 320, 740], ['mobile-360', 360, 800], ['mobile-390', 390, 844],
  ['mobile-430', 430, 932], ['mobile-480', 480, 900],
  ['tv-1080', 1920, 1080], ['tv-4k', 3840, 2160]
];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './tests/e2e/global-setup.mjs',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:18996',
    ...browsers[browser],
    screenshot: 'only-on-failure',
    // Traces include session tokens: artifacts remain in ignored test-results.
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 15_000
  },
  projects: resolutions.map(([name, width, height]) => ({
    name,
    use: { viewport: { width, height }, storageState: `.lab/auth/${name.startsWith('tv-') ? 'tv' : 'limited'}.local.json`, hasTouch: name.startsWith('mobile-') || name.startsWith('tablet-') },
    metadata: { browser, tv: name.startsWith('tv-'), enhanced: process.env.JELLYTV_ENHANCED === '1' }
  }))
});
