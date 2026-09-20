/** Pure helpers + WKWebView eval snippets for Host Browser chrome. */

/** Fallback favicon when the page does not declare <link rel=icon>. */
export function fallbackFaviconUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/** Scale page down when desktop layout is wider than the docked panel. */
export function computeFitWidthZoom(
  scrollWidth: number,
  innerWidth: number,
  options?: { minZoom?: number; slackPx?: number },
): number {
  const minZoom = options?.minZoom ?? 0.55;
  const slackPx = options?.slackPx ?? 8;
  if (
    !Number.isFinite(scrollWidth) ||
    !Number.isFinite(innerWidth) ||
    innerWidth < 32 ||
    scrollWidth <= innerWidth + slackPx
  ) {
    return 1;
  }
  const z = innerWidth / scrollWidth;
  return Math.max(minZoom, Math.min(1, z));
}

/**
 * Run inside the child WKWebView after load / bounds sync.
 * Uses CSS zoom (WebKit) so wide desktop sites (e.g. Baidu) fit the panel
 * instead of looking right-shifted in a ~500px dock.
 */
export const BROWSER_FIT_WIDTH_EVAL = `(function(){try{var d=document.documentElement;if(!d)return;if(String(location.protocol||"").indexOf("about:")===0)return;d.style.zoom="1";var body=document.body;var sw=Math.max(d.scrollWidth||0,body?body.scrollWidth:0);var iw=window.innerWidth||d.clientWidth||0;if(iw<32||sw<=iw+8)return;var z=Math.max(0.55,Math.min(1,iw/sw));d.style.zoom=String(z);}catch(_){}})()`;

/**
 * Returns `{ title, favicon }` from the child page. Favicon is fetched via the
 * page's network (SOCKS) as a data URL when possible so LAN/loopback icons work.
 */
export const BROWSER_PAGE_META_EVAL = `(function(){try{if(String(location.protocol||"").indexOf("about:")===0)return JSON.stringify({title:"",favicon:""});var title=(document.title||"").trim();var href="";var nodes=document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');for(var i=0;i<nodes.length;i++){var h=nodes[i].href;if(h){href=h;break;}}if(!href)href=location.origin+"/favicon.ico";return JSON.stringify({title:title,favicon:href});}catch(e){return JSON.stringify({title:"",favicon:""});}})()`;
