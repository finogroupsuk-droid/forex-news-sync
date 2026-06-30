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

const FEED_URL = "https://www.investing.com/rss/news_1.rss";
const SOURCE_NAME = "Investing.com";
const ITEM_LIMIT = 10;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
};

function extractImageFromFeed(item) {
  if (item.mediaContent && item.mediaContent['$'] && item.mediaContent['$'].url) {
    return item.mediaContent['$'].url;
  }
  if (item.mediaThumbnail && item.mediaThumbnail['$'] && item.mediaThumbnail['$'].url) {
    return item.mediaThumbnail['$'].url;
  }
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  return "";
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchArticleMeta(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return {};
    const html = await res.text();

    const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
      || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

    const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    return {
      description: descMatch ? decodeHtmlEntities(descMatch[1]).trim() : "",
      image: imageMatch ? imageMatch[1].trim() : ""
    };
  } catch (err) {
    console.warn(`خطا در خواندن صفحه خبر ${url}: ${err.message}`);
    return {};
  }
}

async function main() {
  const parsed = await parser.parseURL(FEED_URL);
  const items = parsed.items.slice(0, ITEM_LIMIT);

  const articles = [];

  for (const item of items) {
    const link = item.link || "";
    if (!link) continue;

    const feedImage = extractImageFromFeed(item);
    const meta = await fetchArticleMeta(link);

    articles.push({
      title: item.title || "بدون عنوان",
      summary: meta.description || "",
      image_url: feedImage || meta.image || "",
      source_url: link,
      source_name: SOURCE_NAME,
      published_date: item.isoDate || item.pubDate || new Date().toISOString()
    });
  }

  console.log(`تعداد اخبار دریافت‌شده: ${articles.length}`);
  articles.forEach(a => {
    console.log(`- ${a.title} | عکس: ${a.image_url ? "دارد" : "ندارد"} | طول متن: ${a.summary.length}`);
  });

  const deleteRes = await fetch(BASE_URL, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "api_key": API_KEY
    },
    body: JSON.stringify({})
  });

  if (!deleteRes.ok) {
    console.warn(`هشدار در پاک کردن رکوردهای قبلی: ${deleteRes.status}`);
  } else {
    console.log("رکوردهای قبلی پاک شدند.");
  }

  const bulkRes = await fetch(`${BASE_URL}/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api_key": API_KEY
    },
    body: JSON.stringify(articles)
  });

  if (!bulkRes.ok) {
    const errText = await bulkRes.text();
    throw new Error(`خطا در ارسال اخبار به Base44: ${bulkRes.status} - ${errText}`);
  }

  console.log(`با موفقیت ${articles.length} خبر ذخیره شد.`);
}

main().catch(err => {
  console.error("خطا در اجرای اسکریپت اخبار:", err.message);
  process.exit(1);
});
