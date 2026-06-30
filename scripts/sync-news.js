const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure']
    ]
  }
});

const APP_ID = process.env.BASE44_APP_ID;
const API_KEY = process.env.BASE44_API_KEY;
const BASE_URL = `https://app.base44.com/api/apps/${APP_ID}/entities/NewsArticle`;

const FEEDS = [
  { url: "https://www.investing.com/rss/news_1.rss", name: "Investing.com" },
  { url: "https://www.fxstreet.com/rss", name: "FXStreet" },
  { url: "https://www.dailyforex.com/rss/forexnews.xml", name: "DailyForex" },
  { url: "https://www.forexlive.com/feed", name: "ForexLive" }
];

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
  const content = item.content || item.contentSnippet || item['content:encoded'] || "";
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  if (match) return match[1];
  return "";
}

function cleanSummary(text) {
  if (!text) return "";
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 300 ? stripped.slice(0, 300) + "..." : stripped;
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return parsed.items.slice(0, 10).map(item => ({
      title: item.title || "بدون عنوان",
      summary: cleanSummary(item.contentSnippet || item.summary || item.description || ""),
      image_url: extractImage(item),
      source_url: item.link || "",
      source_name: feed.name,
      published_date: item.isoDate || item.pubDate || new Date().toISOString()
    }));
  } catch (err) {
    console.warn(`خطا در خواندن فید ${feed.name}: ${err.message}`);
    return [];
  }
}

async function main() {
  let allArticles = [];
  for (const feed of FEEDS) {
    const items = await fetchFeed(feed);
    console.log(`${feed.name}: ${items.length} خبر دریافت شد`);
    allArticles = allArticles.concat(items);
  }

  allArticles = allArticles.filter(a => a.source_url);
  console.log(`مجموع اخبار معتبر: ${allArticles.length}`);

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
    body: JSON.stringify(allArticles)
  });

  if (!bulkRes.ok) {
    const errText = await bulkRes.text();
    throw new Error(`خطا در ارسال اخبار به Base44: ${bulkRes.status} - ${errText}`);
  }

  console.log(`با موفقیت ${allArticles.length} خبر ذخیره شد.`);
}

main().catch(err => {
  console.error("خطا در اجرای اسکریپت اخبار:", err.message);
  process.exit(1);
});
