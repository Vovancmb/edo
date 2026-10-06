/* ============================================================
   Watermark «ДОКУМЕНТ ТОЛЬКО ДЛЯ ВНУТРЕННЕГО ПОЛЬЗОВАНИЯ»
   + персональный след.

   ВАЖНО:
   - Отображается ТОЛЬКО в браузере (CSS-слой поверх превью).
   - При печати из программы — СКРЫТ (@media print).
   - В скачанный файл НЕ вшивается (бэкенд отдаёт оригинал).
   ============================================================ */

(function () {
  'use strict';

  const WATERMARK_TEXT = 'ДОКУМЕНТ ТОЛЬКО ДЛЯ ВНУТРЕННЕГО ПОЛЬЗОВАНИЯ';

  async function fetchInfo(docId) {
    try {
      const r = await fetch(`/api/documents/${docId}/watermark-info`, { credentials: 'same-origin' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function ensurePrintCSS() {
    if (document.getElementById('edo-print-css')) return;
    const style = document.createElement('style');
    style.id = 'edo-print-css';
    style.textContent = `
      @media print {
        .edo-watermark-layer,
        .edo-watermark-text,
        .edo-watermark-trace,
        .stamp,
        .edo-signature-overlay,
        .topbar, .tabs, .fab, .icon-btn,
        nav, header, footer,
        .row-actions, .btn {
          display: none !important;
          visibility: hidden !important;
        }
        body, main, .pages, .page-wrap { background: #fff !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildLayer(info) {
    const layer = document.createElement('div');
    layer.className = 'edo-watermark-layer';

    // Диагональный текст «ДОКУМЕНТ ТОЛЬКО ДЛЯ ВНУТРЕННЕГО ПОЛЬЗОВАНИЯ»
    const wm = document.createElement('div');
    wm.className = 'edo-watermark-text';
    wm.textContent = WATERMARK_TEXT;
    layer.appendChild(wm);

    // Персональный след внизу
    if (info && info.trace) {
      const trace = document.createElement('div');
      trace.className = 'edo-watermark-trace';
      trace.textContent = info.trace;
      layer.appendChild(trace);
    }

    return layer;
  }

  /**
   * Прикрепляет watermark + след к каждой странице превью.
   * Если страниц нет — вешает один слой на контейнер.
   */
  async function attach(docId, container) {
    if (!container) return;
    ensurePrintCSS();

    const info = await fetchInfo(docId);

    container.querySelectorAll('.edo-watermark-layer').forEach(el => el.remove());

    const pages = container.querySelectorAll('.page-wrap, .page, .doc-page, .preview-page');
    if (pages.length === 0) {
      const layer = buildLayer(info);
      layer.classList.add('edo-watermark-global');
      container.style.position = container.style.position || 'relative';
      container.appendChild(layer);
    } else {
      pages.forEach(p => {
        if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
        p.appendChild(buildLayer(info));
      });
    }
  }

  function formatDate(s) {
    if (!s) return '';
    try { return new Date(s).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }); }
    catch { return s; }
  }



  window.EdoWatermark = { attach, fetchInfo };
})();
