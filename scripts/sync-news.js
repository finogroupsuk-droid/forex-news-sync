const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

const APP_ID = process.env.BASE44_APP_ID;
const API_KEY = process.env.BASE44_API_KEY;
const BASE_URL = `https://app.base44.com/api/apps/${APP_ID}/entities/NewsArticle`;

const FEED_URL = "https://www.forexlive.com/feed/news";
const SOURCE_NAME = "ForexLive";
const ITEM_LIMIT = 10;
const RETENTION_DAYS = 7;
const SUMMARY_MAX_LENGTH = 5000;
const SHORT_TEXT_THRESHOLD = 150;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
};

function extractImage(item) {
  if (item.mediaContent && item.mediaContent['$'] && item.mediaContent['$'].url) {
    return item.mediaContent['$'].url;
  }
  if (item.mediaThumbnail && item.mediaThumbnail['$'] && item.mediaThumbnail['$'].url) {
    return item.mediaThumbnail['$'].url;
  }
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  const content = item.contentEncoded || item.content || "";
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  if (match) return match[1];
  return "";
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return "";
    const html = await res.text();
    const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return imageMatch ? imageMatch[1].trim() : "";
  } catch (err) {
    return "";
  }
}

async function fetchFullArticleText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return "";
    const html = await res.text();

    let articleHtml = "";
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      articleHtml = articleMatch[1];
    } else {
      const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
      return descMatch ? decodeHtmlEntities(descMatch[1]).trim() : "";
    }

    return cleanText(articleHtml);
  } catch (err) {
    console.warn(`خطا در خواندن متن کامل از ${url}: ${err.message}`);
    return "";
  }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(html) {
  if (!html) return "";
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]*>/g, " ");
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function buildFeedSummary(item) {
  const fullText = cleanText(item.contentEncoded || item.content || item.description || item.contentSnippet || "");
  return fullText;
}

function trimSummary(text) {
  if (text.length > SUMMARY_MAX_LENGTH) {
    return text.slice(0, SUMMARY_MAX_LENGTH) + "...";
  }
  return text;
}

async function getExistingArticles() {
  const res = await fetch(`${BASE_URL}?limit=500`, {
    headers: { "api_key": API_KEY }
  });
  if (!res.ok) {
    console.warn(`هشدار در خواندن رکوردهای موجود: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || data.data || []);
}

async function deleteOldArticles(existing) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = existing.filter(a => {
    const t = new Date(a.published_date).getTime();
    return !isNaN(t) && t < cutoff;
  });

  console.log(`تعداد خبرهای قدیمی‌تر از ${RETENTION_DAYS} روز برای حذف: ${toDelete.length}`);

  for (const article of toDelete) {
    if (!article.id) continue;
    try {
      const res = await fetch(`${BASE_URL}/${article.id}`, {
        method: "DELETE",
        headers: { "api_key": API_KEY }
      });
      if (!res.ok) {
        console.warn(`خطا در حذف رکورد ${article.id}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`خطا در حذف رکورد ${article.id}: ${err.message}`);
    }
  }
}

async function main() {
  const existing = await getExistingArticles();
  const existingUrls = new Set(existing.map(a => a.source_url));

  const parsed = await parser.parseURL(FEED_URL);
  const items = parsed.items.slice(0, ITEM_LIMIT);

  const newArticles = [];

  for (const item of items) {
    const link = item.link || "";
    if (!link) continue;

    if (existingUrls.has(link)) {
      continue;
    }

    let image = extractImage(item);
    if (!image) {
      image = await fetchOgImage(link);
    }

    let summary = buildFeedSummary(item);

    if (summary.length < SHORT_TEXT_THRESHOLD) {
      const fullText = await fetchFullArticleText(link);
      if (fullText && fullText.length > summary.length) {
        summary = fullText;
      }
    }

    newArticles.push({
      title: item.title || "بدون عنوان",
      summary: trimSummary(summary),
      image_url: image,
      source_url: link,
      source_name: SOURCE_NAME,
      published_date: item.isoDate || item.pubDate || new Date().toISOString()
    });
  }

  console.log(`تعداد خبرهای جدید برای افزودن: ${newArticles.length}`);
  newArticles.forEach(a => {
    console.log(`- ${a.title} | عکس: ${a.image_url ? "دارد" : "ندارد"} | طول متن: ${a.summary.length}`);
  });

  if (newArticles.length > 0) {
    const bulkRes = await fetch(`${BASE_URL}/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": API_KEY
      },
      body: JSON.stringify(newArticles)
    });

    if (!bulkRes.ok) {
      const errText = await bulkRes.text();
      throw new Error(`خطا در ارسال اخبار به Base44: ${bulkRes.status} - ${errText}`);
    }
    console.log(`با موفقیت ${newArticles.length} خبر جدید ذخیره شد.`);
  } else {
    console.log("خبر جدیدی برای افزودن وجود نداشت.");
  }

  await deleteOldArticles(existing);

  console.log("همگام‌سازی کامل شد.");
}

main().catch(err => {
  console.error("خطا در اجرای اسکریپت اخبار:", err.message);
  process.exit(1);
});
