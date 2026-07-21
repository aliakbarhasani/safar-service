exports.index = (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>🚖 سفر سرویس</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: #f4f7fb;
        color: #1f2937;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .container {
        width: min(100%, 720px);
        background: #ffffff;
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
        padding: 40px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #e0f2fe;
        color: #0369a1;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 0.95rem;
        margin-bottom: 24px;
      }

      h1 {
        font-size: clamp(2.25rem, 3vw, 3.25rem);
        margin: 0 0 16px;
        line-height: 1.05;
      }

      p {
        margin: 0 0 24px;
        font-size: 1.05rem;
        line-height: 1.7;
        color: #4b5563;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border-radius: 18px;
        background: #ecfccb;
        color: #4f772d;
        font-weight: 600;
        margin-bottom: 28px;
      }

      button {
        border: none;
        border-radius: 14px;
        padding: 16px 28px;
        background: #2563eb;
        color: #ffffff;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.2s ease, background 0.2s ease;
        width: 100%;
        max-width: 220px;
      }

      button:hover,
      button:focus-visible {
        background: #1d4ed8;
        transform: translateY(-1px);
        outline: none;
      }

      @media (max-width: 560px) {
        .container {
          padding: 28px 20px;
        }

        .badge,
        .status,
        button {
          width: 100%;
        }

        button {
          max-width: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="container">
      <span class="badge">صفحه اصلی سرویس</span>
      <h1>🚖 سفر سرویس</h1>
      <p>نسخه اولیه پروژه</p>
      <div class="status">سرور با موفقیت در حال اجرا است</div>
      <button type="button">شروع</button>
    </main>
  </body>
</html>`);
};