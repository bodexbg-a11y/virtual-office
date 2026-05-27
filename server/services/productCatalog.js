const axios = require('axios');

const SITE_URLS = [
  'https://bodexbg.com',
  'https://www.bodexbg.com',
  'https://bodexbulgaria.com',
  'https://www.bodexbulgaria.com',
];

const BODEX_SITE_PRODUCTS = [
  {
    id: 'joints',
    titleBg: 'Уплътняване на работни фуги',
    titleEn: 'Joint Sealing',
    descBg: 'Инжекционни решения за надеждно уплътняване на работни фуги в бетонни конструкции.',
    descEn: 'Injection solutions for reliable sealing of construction joints in concrete structures.',
    materials: ['HydroBloc PU 500', 'HydroBloc 575 Integral', 'HydroBloc AC 502', 'HydroBloc Injekt 583'],
  },
  {
    id: 'expansion',
    titleBg: 'Дилатационни фуги',
    titleEn: 'Expansion Joints',
    descBg: 'Системи за дълготрайно уплътняване на дилатационни фуги при движение на конструкцията.',
    descEn: 'Systems for durable sealing of expansion joints with structural movement.',
    materials: ['HydroBloc 500-15', 'HydroBloc Rapid 570', 'HydroBloc Rapid 572', 'Polygel 530 + Polyblend 540'],
  },
  {
    id: 'curtain',
    titleBg: 'Завесна инжекция',
    titleEn: 'Curtain Injection',
    descBg: 'Инжекционни системи за създаване на водонепропусклива завеса в почва и конструкция.',
    descEn: 'Injection systems for creating a waterproof curtain in soil and structures.',
    materials: ['Polygel 530 + Polyblend 540', 'HydroBloc Polygrout 650', 'HydroBloc Polygel 660', 'SiliBond Si 711'],
  },
  {
    id: 'cracks',
    titleBg: 'Запълване на пукнатини',
    titleEn: 'Crack Filling',
    descBg: 'Материали за запълване и инжектиране на пукнатини в бетон и зидария.',
    descEn: 'Materials for filling and injecting cracks in concrete and masonry.',
    materials: ['HydroBloc PU 500', 'HydroBloc 575 Integral', 'HydroBloc Injekt 583', 'HydroBloc Rapid 570'],
  },
  {
    id: 'waterstop',
    titleBg: 'Спиране на течове',
    titleEn: 'Water Leak Stop',
    descBg: 'Бързи решения за спиране на активни течове и инфилтрации.',
    descEn: 'Fast solutions for stopping active leaks and infiltrations.',
    materials: ['HydroBloc Rapid 570', 'HydroBloc Rapid 572', 'Polygel 530', 'SiliBond Si 711'],
  },
  {
    id: 'cavity',
    titleBg: 'Запълване на кухини',
    titleEn: 'Void Filling',
    descBg: 'Материали за инжекционно запълване на кухини, празнини и нестабилни участъци.',
    descEn: 'Injection materials for filling cavities, voids and unstable zones.',
    materials: ['Polygel 530 + Polyblend 540', 'HydroBloc Polygrout 650', 'HydroBloc Polygel 660', 'HydroBloc 500-15'],
  },
  {
    id: 'excavation',
    titleBg: 'Шпунтови стени и изкопи',
    titleEn: 'Sheet Piles and Excavation',
    descBg: 'Решения за изкопи, шпунтови стени и водопонижаващи зони.',
    descEn: 'Solutions for excavation pits, sheet piles and dewatering zones.',
    materials: ['HydroBloc PU 500', 'HydroBloc Rapid 570', 'HydroBloc Polygrout 650', 'SiliBond Si 711'],
  },
  {
    id: 'pipes',
    titleBg: 'Канали и шахти',
    titleEn: 'Channels and Shafts',
    descBg: 'Материали за хидроизолация и ремонт на канали, шахти и технически отвори.',
    descEn: 'Materials for waterproofing and repair of channels, shafts and technical openings.',
    materials: ['HydroBloc Injekt 583', 'HydroBloc 575 Integral', 'HydroBloc Polygrout 650', 'HydroBloc 500-15'],
  },
  {
    id: 'structural',
    titleBg: 'Структурно укрепване',
    titleEn: 'Structural Strengthening',
    descBg: 'Системи за укрепване и възстановяване на носещи елементи и бетонови конструкции.',
    descEn: 'Systems for strengthening and restoring load-bearing elements and concrete structures.',
    materials: ['HydroBloc 575 Integral', 'HydroBloc Polygrout 650', 'HydroBloc PU 500', 'HydroBloc Injekt 583'],
  },
  {
    id: 'anchoring',
    titleBg: 'Анкериране',
    titleEn: 'Anchoring',
    descBg: 'Материали за анкериране и фиксиране при ремонтни и укрепващи работи.',
    descEn: 'Materials for anchoring and fixing in repair and reinforcement works.',
    materials: ['HydroBloc Injekt 583', 'HydroBloc 575 Integral', 'HydroBloc Rapid 570', 'HydroBloc PU 500'],
  },
  {
    id: 'slab',
    titleBg: 'Повдигане на плочи',
    titleEn: 'Slab Lifting',
    descBg: 'Инжекционни материали за стабилизиране и повдигане на плочи и основи.',
    descEn: 'Injection materials for stabilizing and lifting slabs and foundations.',
    materials: ['HydroBloc Polygrout 650', 'HydroBloc Polygel 660', 'HydroBloc 500-15', 'Polygel 530 + Polyblend 540'],
  },
  {
    id: 'barrier',
    titleBg: 'Хоризонтална бариера',
    titleEn: 'Horizontal Barrier',
    descBg: 'Решения за хоризонтална бариера срещу влага и капилярно покачване.',
    descEn: 'Solutions for horizontal barrier against moisture and capillary rise.',
    materials: ['SiliBond Si 711', 'HydroBloc PU 500', 'HydroBloc AC 502', 'HydroBloc Rapid 572'],
  },
];

async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    maxRedirects: 4,
    headers: {
      'User-Agent': 'Mozilla/5.0 BODEX-Product-Catalog/1.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return String(res.data || '');
}

function uniq(items) {
  return [...new Set(items)];
}

function parseLocXml(xml) {
  const list = [];
  const re = /<loc>(.*?)<\/loc>/gims;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]) list.push(m[1].trim());
  }
  return list;
}

function toSlugSku(url) {
  const slug = String(url || '')
    .replace(/https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .pop() || 'item';
  return `WEB-${slug.slice(0, 60).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
}

function parseTitle(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return og[1].trim();
  const t = /<title[^>]*>(.*?)<\/title>/is.exec(html);
  if (t?.[1]) return t[1].replace(/\s+/g, ' ').trim();
  const h1 = /<h1[^>]*>(.*?)<\/h1>/is.exec(html);
  if (h1?.[1]) return stripTags(h1[1]).trim();
  return '';
}

function stripTags(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescription(html) {
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (meta?.[1]) return meta[1].trim();
  const p = /<p[^>]*>(.*?)<\/p>/is.exec(html);
  return p?.[1] ? stripTags(p[1]).slice(0, 300) : '';
}

function parsePrice(html) {
  const txt = stripTags(html);
  const m = txt.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(лв|lv|eur|€|\$)/i);
  if (!m) return null;
  const value = Number(String(m[1]).replace(',', '.'));
  if (Number.isNaN(value)) return null;
  return { value, currency: m[2] };
}

function inferCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/gel|гел/.test(t)) return 'gel';
  if (/pump|помп|пакер|packer|инжекц/.test(t)) return 'equip';
  if (/water|хидро|seal|injection|смол/.test(t)) return 'water';
  if (/mortar|бетон|repair|struct|epoxy/.test(t)) return 'structural';
  if (/additive|добавк/.test(t)) return 'additive';
  return 'masonry';
}

function inferSegment(text) {
  const t = String(text || '').toLowerCase();
  if (/tunnel|тунел|инфраструктур|bridge|мост/.test(t)) return 'Инфраструктура';
  if (/factory|industrial|завод|промишлен/.test(t)) return 'Промишлени обекти';
  if (/basement|parking|подзем|паркинг/.test(t)) return 'Подземни паркинги и мазета';
  return 'Строителни фирми и хидроизолация';
}

function inferCallHint(text) {
  const t = String(text || '').toLowerCase();
  if (/инжекц|смол|packer|пакер|pump|помп/.test(t)) {
    return 'Звонить подрядчикам по хидроизоляции и ремонту бетона: предложить B2B поставку материалов под текущие объекты.';
  }
  return 'Звонить строительным компаниям и снабженцам: уточнять текущие объёмы закупки и срок поставки.';
}

function inferCallHintFromProduct(product) {
  const text = `${product.titleBg || ''} ${product.descBg || ''} ${(product.materials || []).join(' ')}`.toLowerCase();
  return inferCallHint(text);
}

async function discoverProductBundle() {
  for (const base of SITE_URLS) {
    try {
      const html = await fetchText(base);
      const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
      if (!scriptMatch?.[1]) continue;
      const jsUrl = new URL(scriptMatch[1], base).toString();
      const js = await fetchText(jsUrl);
      const start = js.indexOf('var pr=[');
      const end = js.indexOf('function Er(){');
      if (start < 0 || end < 0 || end <= start) continue;
      return { baseUrl: base, bundleUrl: jsUrl, chunk: js.slice(start, end) };
    } catch {
      // try next host
    }
  }
  return null;
}

function parseBundleProducts(chunk) {
  const products = [];
  const re = /\{id:`([^`]+)`,titleBg:`([^`]+)`,titleEn:`([^`]+)`,descBg:`([^`]+)`,descEn:`([^`]+)`,materials:\[(.*?)\],icon:/gs;
  let match;
  while ((match = re.exec(chunk)) !== null) {
    const materials = [...(match[6] || '').matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter(Boolean);
    products.push({
      id: match[1],
      titleBg: match[2],
      titleEn: match[3],
      descBg: match[4],
      descEn: match[5],
      materials,
    });
  }
  return products;
}

function mapProductSpecsToItems(specs, sourceBaseUrl) {
  return specs.map((product) => {
    const basis = `${product.titleBg || ''} ${product.descBg || ''} ${(product.materials || []).join(' ')}`;
    return {
      sku: `WEB-${String(product.id || product.titleEn || product.titleBg || 'ITEM').toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
      name: product.titleEn || product.titleBg,
      name_bg: product.titleBg,
      category: inferCategory(basis),
      description_bg: product.descBg,
      price_per_kg: null,
      source_url: `${sourceBaseUrl || 'https://bodexbg.com'}/#products`,
      market_segment: inferSegment(basis),
      call_hint: inferCallHintFromProduct(product),
    };
  });
}

function isLikelyProductUrl(url) {
  const u = String(url || '').toLowerCase();
  return (
    /\/product\//.test(u) ||
    /\/shop\//.test(u) ||
    /\/produkt/.test(u) ||
    /\/products\//.test(u)
  );
}

async function discoverProductUrls() {
  for (const base of SITE_URLS) {
    try {
      const robots = await fetchText(`${base}/robots.txt`);
      const sitemapFromRobots = robots
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => /^sitemap:/i.test(x))
        .map((x) => x.replace(/^sitemap:\s*/i, '').trim());

      const sitemapCandidates = uniq([
        ...sitemapFromRobots,
        `${base}/sitemap.xml`,
        `${base}/sitemap_index.xml`,
      ]);

      const nestedSitemaps = [];
      let urls = [];
      for (const sm of sitemapCandidates) {
        try {
          const xml = await fetchText(sm);
          const locs = parseLocXml(xml);
          nestedSitemaps.push(...locs.filter((x) => /\.xml($|\?)/i.test(x)));
          urls.push(...locs.filter((x) => !/\.xml($|\?)/i.test(x)));
        } catch {
          // ignore bad sitemap candidate
        }
      }

      for (const nested of uniq(nestedSitemaps).slice(0, 30)) {
        try {
          const xml = await fetchText(nested);
          urls.push(...parseLocXml(xml).filter((x) => !/\.xml($|\?)/i.test(x)));
        } catch {
          // ignore bad nested sitemap
        }
      }

      urls = uniq(urls).filter(isLikelyProductUrl);
      if (urls.length) return { baseUrl: base, productUrls: urls };
    } catch {
      // try next host
    }
  }

  throw new Error('Не удалось получить sitemap/catalog с сайта. Проверьте домен и доступность сайта.');
}

async function scanSiteProducts() {
  const bundle = await discoverProductBundle();
  if (bundle?.chunk) {
    const bundleProducts = parseBundleProducts(bundle.chunk);
    if (bundleProducts.length) {
      return {
        source: `${bundle.baseUrl}/assets`,
        total_discovered: bundleProducts.length,
        parsed: bundleProducts.length,
        items: mapProductSpecsToItems(bundleProducts, bundle.baseUrl),
      };
    }
  }

  if (BODEX_SITE_PRODUCTS.length) {
    return {
      source: 'https://bodexbg.com/#products (fallback)',
      total_discovered: BODEX_SITE_PRODUCTS.length,
      parsed: BODEX_SITE_PRODUCTS.length,
      items: mapProductSpecsToItems(BODEX_SITE_PRODUCTS, 'https://bodexbg.com'),
    };
  }

  const { baseUrl, productUrls } = await discoverProductUrls();
  const items = [];

  for (const url of productUrls.slice(0, 400)) {
    try {
      const html = await fetchText(url);
      const title = parseTitle(html);
      if (!title) continue;
      const description = parseDescription(html);
      const price = parsePrice(html);
      const basis = `${title} ${description}`;

      items.push({
        sku: toSlugSku(url),
        name: title,
        name_bg: title,
        category: inferCategory(basis),
        description_bg: description,
        price_per_kg: price?.value || null,
        source_url: url,
        market_segment: inferSegment(basis),
        call_hint: inferCallHint(basis),
      });
    } catch {
      // skip page
    }
  }

  return {
    source: baseUrl,
    total_discovered: productUrls.length,
    parsed: items.length,
    items,
  };
}

module.exports = {
  scanSiteProducts,
};
