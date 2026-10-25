import config from './playwright.config.mjs';

export default {
  ...config,
  globalSetup: undefined,
  testMatch: '**/lifecycle.spec.mjs',
  projects: config.projects.filter(project => project.name === 'laptop'),
  outputDir: '.lab/lifecycle-traces',
  reporter: [['list'], ['json', { outputFile: '.lab/lifecycle-results.json' }]]
};
