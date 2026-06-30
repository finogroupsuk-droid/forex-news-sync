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

function cleanText(html) {
  if (!html) return "";
  let text = html
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function buildSummary(item) {
  const fullText = cleanText(item.contentEncoded || item.content || item.description || item.contentSnippet || "");
  if (fullText.length > 600) {
    return fullText.slice(0, 600) + "...";
  }
  return fullText;
}

async function main() {
  const parsed = await parser.parseURL(FEED_URL);
  const items = parsed.items.slice(0, ITEM_LIMIT);

  const articles = items.map(item => ({
    title: item.title || "بدون عنوان",
    summary: buildSummary(item),
    image_url: extractImage(item),
    source_url: item.link || "",
    source_name: SOURCE_NAME,
    published_date: item.isoDate || item.pubDate || new Date().toISOString()
  })).filter(a => a.source_url);

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
