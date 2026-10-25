/** Disable JellyTV in one browser context for a differential control.
 * Both modes enable routing so browser cache behavior is comparable.
 * This never edits the actual server, account or installation.
 */
export async function configureControl(context, mode) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (mode !== 'enhanced' && url.pathname === '/web/config.json') {
      const response = await route.fetch();
      const config = await response.json();
      config.plugins = config.plugins.filter(plugin => plugin !== 'JellyTVEnhanced');
      return route.fulfill({ response, json: config });
    }
    if (mode === 'baseline' && url.pathname === '/Branding/Configuration') {
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...await response.json(), CustomCss: '' } });
    }
    if (mode !== 'enhanced' && url.pathname.startsWith('/web/jellytv/')) return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: '' });
    return route.continue();
  });
}
