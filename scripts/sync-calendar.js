const APP_ID = process.env.BASE44_APP_ID;
const API_KEY = process.env.BASE44_API_KEY;
const BASE_URL = `https://app.base44.com/api/apps/${APP_ID}/entities/EconomicEvent`;

const IMPACT_MAP = {
  "High": "High",
  "Medium": "Medium",
  "Low": "Low",
  "Holiday": "Low"
};

async function main() {
  const ffRes = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Referer": "https://www.forexfactory.com/calendar"
    }
  });

  if (!ffRes.ok) {
    throw new Error(`خطا در دریافت داده از فارکس فکتوری: ${ffRes.status}`);
  }

  const ffData = await ffRes.json();
  console.log(`تعداد رویدادهای دریافتی: ${ffData.length}`);

  const events = ffData
    .filter(item => IMPACT_MAP[item.impact])
    .map(item => ({
      title: item.title || "بدون عنوان",
      currency: item.country,
      impact: IMPACT_MAP[item.impact],
      event_date: item.date,
      previous_value: item.previous || "",
      forecast_value: item.forecast || "",
      actual_value: item.actual || "",
      description: item.title || ""
    }))
    .filter(e => ["USD","EUR","GBP","JPY","CHF","AUD","CAD","NZD"].includes(e.currency));

  console.log(`تعداد رویدادهای معتبر برای ارسال: ${events.length}`);

  const deleteRes = await fetch(BASE_URL, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({})
  });

  if (!deleteRes.ok) {
    console.warn(`هشدار در پاک کردن رکوردهای قبلی: ${deleteRes.status}`);
  } else {
    console.log("رکوردهای قبلی با موفقیت پاک شدند.");
  }

  const bulkRes = await fetch(`${BASE_URL}/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify(events)
  });

  if (!bulkRes.ok) {
    const errText = await bulkRes.text();
    throw new Error(`خطا در ارسال داده به Base44: ${bulkRes.status} - ${errText}`);
  }

  await bulkRes.json();
  console.log(`با موفقیت ${events.length} رویداد ذخیره شد.`);
}

main().catch(err => {
  console.error("خطا در اجرای اسکریپت:", err.message);
  process.exit(1);
});
