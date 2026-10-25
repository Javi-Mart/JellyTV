/** Identify the bounded hero query without changing the authenticated client. */
export function isFeaturedRequest(request) {
  const url = new URL(request.url());
  return url.pathname === '/Items'
    && url.searchParams.get('includeItemTypes') === 'Movie,Series'
    && url.searchParams.get('fields') === 'Overview,Genres,Taglines,PrimaryImageAspectRatio'
    && url.searchParams.get('limit') === '6';
}
