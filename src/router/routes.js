export const PAGE_ROUTES = {
  home: '/',
  create: '/create',
  'quick-create': '/quick-create',
  gallery: '/gallery',
  models: '/models',
  'api-keys': '/api-keys',
  admin: '/admin',
  'admin-models': '/admin/models',
};

const LEGACY_ROUTE_REDIRECTS = {
  '/video': 'home',
  '/product': 'home',
  '/retouch': 'home',
  '/portrait': 'home',
};

const ROUTE_PAGES = Object.entries(PAGE_ROUTES).reduce((acc, [page, path]) => {
  acc[path] = page;
  return acc;
}, {});

export const getPathForPage = (page) => PAGE_ROUTES[page] || PAGE_ROUTES.home;

export const getPageFromPath = (pathname) => {
  const normalized = normalizePath(pathname);
  if (LEGACY_ROUTE_REDIRECTS[normalized]) {
    return LEGACY_ROUTE_REDIRECTS[normalized];
  }
  return ROUTE_PAGES[normalized] || 'home';
};

export const getCurrentPageFromLocation = () => {
  if (typeof window === 'undefined') return 'home';
  return getPageFromPath(window.location.pathname);
};

export const navigateToPage = (page, { replace = false } = {}) => {
  if (typeof window === 'undefined') return;

  const path = getPathForPage(page);
  const nextUrl = `${path}${window.location.search || ''}`;
  const currentUrl = `${window.location.pathname}${window.location.search || ''}`;

  if (nextUrl === currentUrl) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({ page }, '', nextUrl);
};

const normalizePath = (pathname) => {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
};
