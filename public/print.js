/* ============================================================
   Модуль печати документа без подписей, watermark и следов.
   Открывает отдельное окно с чистыми картинками страниц
   и вызывает window.print().
   ============================================================ */

(function () {
  'use strict';

  /**
   * Печатает документ: все страницы подряд, без подписей, watermark и следов.
   * @param {number} docId
   * @param {string} title — заголовок для окна печати
   * @param {number} pages — количество страниц
   */
  function printDocument(docId, title, pages) {
    const n = Math.max(1, parseInt(pages, 10) || 1);
    const safeTitle = String(title || 'Документ').replace(/[<>]/g, '');

    // Собираем URL-ы всех страниц
    const imgUrls = [];
    for (let i = 1; i <= n; i++) {
      imgUrls.push(`/api/documents/${docId}/pages/${i}?print=1`);
    }

    // Открываем окно печати
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      alert('Разрешите всплывающие окна для печати документа');
      return;
    }

    // HTML для окна печати
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: Arial, sans-serif;
    color: #000;
  }
  .print-header {
    text-align: center;
    font-size: 11pt;
    color: #333;
    padding: 8px 0;
    border-bottom: 1px solid #ddd;
    margin-bottom: 12px;
  }
  .page {
    display: block;
    width: 100%;
    max-width: 100%;
    margin: 0 auto 12px auto;
    page-break-after: always;
    page-break-inside: avoid;
    break-after: page;
  }
  .page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .page img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    border: none;
  }
  @media print {
    .print-header { display: none !important; }
    .page { margin: 0; }
    @page { margin: 10mm; size: auto; }
  }
</style>
</head>
<body>
  <div class="print-header">${safeTitle}</div>
  ${imgUrls.map((src, i) => `
    <div class="page" data-page="${i + 1}">
      <img src="${src}" alt="Страница ${i + 1}">
    </div>
  `).join('')}
  <script>
    (function () {
      // Ждём загрузки всех картинок
      const imgs = Array.from(document.images);
      let loaded = 0;
      const total = imgs.length;

      function tryPrint() {
        loaded++;
        if (loaded >= total) {
          // Небольшая задержка, чтобы браузер отрисовал
          setTimeout(() => {
            window.focus();
            window.print();
          }, 300);
        }
      }

      if (total === 0) {
        setTimeout(() => window.print(), 300);
        return;
      }

      imgs.forEach(img => {
        if (img.complete) tryPrint();
        else {
          img.addEventListener('load', tryPrint);
          img.addEventListener('error', tryPrint);
        }
      });

      // Закрываем окно после печати (или отмены)
      window.addEventListener('afterprint', () => {
        setTimeout(() => window.close(), 500);
      });
    })();
  </script>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  window.EdoPrint = { printDocument };
})();
