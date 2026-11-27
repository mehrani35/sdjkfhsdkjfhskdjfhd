# AIGames — Railway AI Gateway (v0.2.0)

این سرویس فقط خط تولید هوش مصنوعی است؛ توکن روبیکا، دیتابیس اصلی و پنل مدیریت در آن قرار نمی‌گیرند.

## پنج عامل

| شماره | عامل | متغیر API Key |
|---:|---|---|
| 1 | Planner AI | `GEMINI_API_KEY_1` |
| 2 | Game Designer AI | `GEMINI_API_KEY_2` |
| 3 | Developer AI | `GEMINI_API_KEY_3` |
| 4 | Reviewer AI | `GEMINI_API_KEY_4` |
| 5 | QA Tester AI | `GEMINI_API_KEY_5` |

هر عامل از کلید تخصیص‌داده‌شده خودش استفاده می‌کند. کلیدها در کد، لاگ یا پاسخ API نمایش داده نمی‌شوند. این نگاشت برای جداسازی اعتبارنامه‌ها و حسابداری استفاده است؛ از چند کلید برای دور زدن محدودیت جغرافیایی، سقف مصرف، quota یا شرایط ارائه‌دهنده استفاده نکن. هر کلید باید برای پروژه و منطقه مجاز خودش صادر شده باشد.

مدل پیش‌فرض: `gemini-3.5-flash-lite` (متغیر `GEMINI_MODEL`). نام مدل قابل تغییر است؛ قبل از تغییر، نام و دسترسی مدل را در مستندات Google AI for Developers بررسی کن.

## Deploy روی Railway

1. محتویات همین پوشه `railway/` را در یک repository مستقل Git قرار بده یا با Railway CLI از همین پوشه deploy کن.
2. اگر از monorepo استفاده می‌کنی، Root Directory سرویس را روی `/railway` تنظیم کن.
3. این متغیرها را در Railway → Variables تنظیم کن:
   - `AI_GATEWAY_SECRET`: رشته تصادفی قوی؛ باید دقیقاً با VPS یکسان باشد.
   - `GEMINI_API_KEY_1` تا `GEMINI_API_KEY_5`: پنج کلید مجاز و فعال.
   - `GEMINI_MODEL=gemini-3.5-flash-lite`
   - `MAX_CONCURRENT_BUILDS=2`
4. Deploy کن و دامنه HTTPS سرویس را بردار.
5. در VPS، `AI_GATEWAY_URL` را روی دامنه Railway و `AI_GATEWAY_SECRET` را روی همان secret تنظیم کن.

Railway به‌خودی‌خود محدودیت‌های جغرافیایی Google را حذف نمی‌کند. استفاده از Gemini باید با مناطق و شرایط پشتیبانی‌شده توسط Google سازگار باشد. در صورت نبود دسترسی مجاز، باید از provider دیگری استفاده شود؛ چند API key این محدودیت را برطرف نمی‌کند.

## API

`GET /health` وضعیت سرویس، مدل، تعداد کلیدهای تنظیم‌شده و ظرفیت را برمی‌گرداند؛ هیچ secret یا مقدار کلیدی برنمی‌گردد.

`POST /v1/games/generate`

Header:

```http
x-aigames-secret: THE_SHARED_SECRET
Content-Type: application/json
```

Body:

```json
{
  "requestId": "job-uuid",
  "groupId": "rubika-group-id",
  "groupTitle": "My group",
  "requesterName": "Group manager",
  "prompt": "Create a piano note guessing game with four choices and a 30 second round."
}
```

برای توسعه بازی موجود، `existingSpec` نیز در body ارسال می‌شود. پاسخ شامل manifest بازی، README، test cases و نتیجه اعتبارسنجی ساختاری است.

## تست و اجرای امن

- سرویس هیچ JavaScript یا shell تولیدشده‌ای را اجرا نمی‌کند.
- خروجی مدل فقط به JSON DSL محدود بازی تبدیل و validate می‌شود.
- تست‌های QA تولیدشده توسط AI صرفاً test plan هستند؛ تست‌های اجرایی واقعی این نسخه توسط validator قطعی روی VPS انجام می‌شوند.
- سرویس هم‌زمانی درخواست‌ها را محدود می‌کند و در صورت پرشدن ظرفیت، HTTP 429 می‌دهد.
- درخواست‌ها synchronous هستند؛ اگر pipeline طولانی شد، VPS timeout را با `AI_TIMEOUT_MS` تنظیم کن. برای مقیاس بیشتر در نسخه بعدی باید صف پایدار و worker اضافه شود.


## دسترسی Gemini

Gateway درخواست‌ها را به API رسمی Gemini با کلیدهای دارای مجوز و از طریق `GEMINI_API_BASE` ارسال می‌کند. این تنظیم فقط برای endpoint سازگار و مجاز است؛ استفاده از Worker یا پراکسی برای پنهان‌کردن مبدأ و دورزدن محدودیت‌های جغرافیایی/شرایط سرویس پشتیبانی نمی‌شود. اگر Gemini برای حساب یا محل استقرار مجاز نیست، از ارائه‌دهنده‌ای استفاده کن که استفاده از API آن در محل و حساب تو مجاز است.
