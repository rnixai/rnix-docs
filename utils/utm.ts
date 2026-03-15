/**
 * Append UTM parameters for PostHog analytics (docs site outbound links).
 * utm_source=docs — traffic from rnix docs
 * utm_medium — link type (nav, footer, cta, link)
 * utm_content — specific placement for attribution
 */
export function withUtm(
  url: string,
  content: string,
  medium: 'nav' | 'footer' | 'cta' | 'link' = 'link'
): string {
  const params = new URLSearchParams({
    utm_source: 'docs',
    utm_medium: medium,
    utm_campaign: 'rnix_homepage',
    utm_content: content,
  })
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${params.toString()}`
}
