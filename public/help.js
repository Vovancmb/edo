(function(){
  'use strict';

  const HELP_SECTIONS = [
    {
      id: 'start',
      num: '1',
      title: 'Начало работы',
      html: `
        <h3>Начало работы</h3>
        <p class="help-lead">ЭДО — электронный документооборот. Здесь вы загружаете документы, отправляете их на подпись коллегам и подписываете входящие.</p>

        <h4>Вход в систему</h4>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Откройте <strong>onlyoffice.a22mail.ru</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Введите <strong>логин</strong> и <strong>пароль</strong>, выданные администратором.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Нажмите <strong>«Войти»</strong>.</div></div>

        <h4>Создание НЭП</h4>
        <p>Чтобы подписывать документы, нужна личная электронная подпись.</p>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Откройте <strong>личный кабинет</strong> (иконка 👤 справа вверху).</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Нажмите <strong>«Создать НЭП»</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Придумайте и сохраните <strong>пароль для подписи</strong>.</div></div>
        <div class="help-warn">Пароль НЭП не хранится в системе. Если забудете — придётся создавать новую подпись.</div>

        <h4>Главный экран</h4>
        <p>Рабочая доска содержит пять колонок:</p>
        <table class="help-table">
          <tr><th>Колонка</th><th>Что в ней</th></tr>
          <tr><td>📝 Мои документы</td><td>Ваши черновики и документы, к которым вам дали доступ</td></tr>
          <tr><td>📥 Входящие</td><td>Документы, ждущие вашей подписи</td></tr>
          <tr><td>⏳ Ожидают</td><td>Отправлены, но подписали ещё не все</td></tr>
          <tr><td>✅ Утверждённые</td><td>Все подписали — документ готов</td></tr>
          <tr><td>❌ Не утверждены</td><td>Кто-то отменил подпись</td></tr>
        </table>
      `
    },

    {
      id: 'upload',
      num: '2',
      title: 'Загрузка документа',
      html: `
        <h3>Загрузка документа</h3>
        <p class="help-lead">Новый документ всегда создаётся в колонке «Мои документы» со статусом «Черновик». Отправка на подпись — отдельный шаг.</p>

        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Нажмите <strong>«＋ Загрузить документ»</strong> сверху слева (или круглую кнопку ＋ справа внизу).</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Выберите <strong>файл</strong> — PDF или изображение.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Укажите <strong>название</strong> (необязательно). Если оставить пустым — подставится имя файла.</div></div>
        <div class="help-step"><div class="help-step-num">4</div><div class="help-step-body">Выберите <strong>категорию</strong> — например, «Акты» или «Счета».</div></div>
        <div class="help-step"><div class="help-step-num">5</div><div class="help-step-body">В блоке <strong>«Предоставить доступ»</strong> отметьте пользователей и/или группы, кто должен видеть документ.</div></div>
        <div class="help-step"><div class="help-step-num">6</div><div class="help-step-body">Нажмите <strong>«Загрузить документ»</strong>.</div></div>

        <p>Документ появится в колонке <strong>«Мои документы»</strong> со статусом «Черновик».</p>
        <div class="help-info">Категорию и название можно поменять позже, пока документ остаётся черновиком.</div>
      `
    },

    {
      id: 'edit',
      num: '3',
      title: 'Редактирование',
      html: `
        <h3>Редактирование документа</h3>
        <p class="help-lead">Правка доступна только у черновика. После отправки на подпись название и категорию изменить нельзя.</p>

        <h4>Через карточку в списке</h4>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">В «Моих документах» на карточке черновика нажмите <strong>«✎ Редактировать»</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Измените название, категорию, при необходимости замените файл или пересмотрите список тех, кому дали доступ.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Нажмите <strong>«Сохранить»</strong>.</div></div>

        <h4>Быстрая правка прямо в карточке</h4>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Откройте черновик.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">В левой панели найдите блок <strong>«Название и категория»</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Измените название и категорию, нажмите <strong>«Сохранить»</strong>.</div></div>

        <div class="help-warn">Правка названия и категории доступна только пока документ в статусе «Черновик». Для остальных статусов блок скрыт — это правило ЭДО, чтобы подписанный документ нельзя было подменить.</div>
      `
    },

    {
      id: 'send',
      num: '4',
      title: 'Отправка на подпись',
      html: `
        <h3>Отправка документа на подпись</h3>
        <p class="help-lead">Отправка запускает процесс согласования. Документ уходит из «Моих документов» в колонку «Ожидают».</p>

        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">На карточке черновика нажмите <strong>«Отправить»</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Откроется окно из двух колонок: слева — параметры, справа — сам документ.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body"><strong>Кликните по странице</strong> в том месте, где должна стоять ваша подпись.</div></div>
        <div class="help-step"><div class="help-step-num">4</div><div class="help-step-body">При желании добавьте <strong>комментарий</strong> — он появится на документе рядом с подписью.</div></div>
        <div class="help-step"><div class="help-step-num">5</div><div class="help-step-body">Введите <strong>пароль НЭП</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">6</div><div class="help-step-body">Добавьте <strong>получателей</strong> — пользователей и/или группы.</div></div>
        <div class="help-step"><div class="help-step-num">7</div><div class="help-step-body">Нажмите <strong>«Отправить на подписание»</strong>.</div></div>

        <h4>Режимы подписи</h4>
        <table class="help-table">
          <tr><th>Режим</th><th>Что делает</th></tr>
          <tr><td>Все в одном месте</td><td>Все получатели ставят подпись в одном и том же месте</td></tr>
          <tr><td>По очереди</td><td>Подпись переходит к следующему, только после того как подписал предыдущий</td></tr>
          <tr><td>Каждому своё место</td><td>Для каждого получателя можно указать отдельное место подписи</td></tr>
        </table>

        <p>После отправки документ переходит в колонку <strong>«Ожидают»</strong>, а каждому получателю приходит уведомление.</p>
      `
    },

    {
      id: 'inbox',
      num: '5',
      title: 'Подписание входящего',
      html: `
        <h3>Подписание входящего документа</h3>
        <p class="help-lead">Когда коллега отправляет вам документ на подпись, он появляется в колонке «Входящие», а на иконке 🔔 загорается красный значок.</p>

        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Перейдите в колонку <strong>📥 Входящие</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Откройте документ — он откроется в модальном окне с превью страниц.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">В левой панели найдите блок с кнопками <strong>«Подписать»</strong> и <strong>«Отменить подпись»</strong>.</div></div>

        <h4>Чтобы подписать</h4>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Введите <strong>пароль НЭП</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">При желании оставьте комментарий.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Нажмите <strong>«Подписать»</strong>.</div></div>

        <h4>Чтобы отказаться</h4>
        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Нажмите <strong>«Отменить подпись»</strong>.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">Обязательно укажите <strong>причину</strong> — без неё система не даст отправить.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Подтвердите.</div></div>

        <div class="help-info">После вашей подписи отправитель получит уведомление, а документ обновится в его списке. Когда подпишут все — документ перейдёт в колонку «Утверждённые».</div>
      `
    },

    {
      id: 'status',
      num: '6',
      title: 'Статусы документов',
      html: `
        <h3>Статусы документов</h3>
        <p class="help-lead">У каждого документа есть статус — он показывает, на каком этапе согласования документ.</p>

        <table class="help-table">
          <tr><th>Статус</th><th>Что означает</th><th>Что можно делать</th></tr>
          <tr><td>📝 Черновик</td><td>Создан, но не отправлен. Виден только вам и тем, кому вы дали доступ</td><td>Редактировать, отправить, удалить</td></tr>
          <tr><td>⏳ Ожидает утверждения</td><td>Отправлен, но подписали ещё не все</td><td>Смотреть статус</td></tr>
          <tr><td>✅ Утверждён</td><td>Все получатели подписали</td><td>Смотреть, скачать</td></tr>
          <tr><td>❌ Не утверждён</td><td>Хотя бы один получатель отменил подпись</td><td>Смотреть причину</td></tr>
        </table>

        <h4>Как статус меняется</h4>
        <ol>
          <li>Вы загружаете документ → <strong>Черновик</strong>.</li>
          <li>Отправляете на подпись → <strong>Ожидает утверждения</strong>.</li>
          <li>Все подписали → <strong>Утверждён</strong>.</li>
          <li>Кто-то отменил → <strong>Не утверждён</strong> (даже если остальные подписали).</li>
        </ol>
      `
    },

    {
      id: 'notif',
      num: '7',
      title: 'Уведомления',
      html: `
        <h3>Уведомления</h3>
        <p class="help-lead">Система уведомляет вас о важных событиях: документ пришёл на подпись, кто-то подписал ваш документ, кто-то отменил подпись.</p>

        <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body">Нажмите иконку 🔔 в правом верхнем углу.</div></div>
        <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body">В списке увидите все события с датой и кратким описанием.</div></div>
        <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body">Кнопка <strong>«Прочитать все»</strong> очищает счётчик непрочитанных.</div></div>

        <div class="help-info">Красный кружок на иконке 🔔 означает, что есть непрочитанные уведомления.</div>
      `
    },

    {
      id: 'theme',
      num: '8',
      title: 'Тема и личный кабинет',
      html: `
        <h3>Тема и личный кабинет</h3>

        <h4>Смена темы</h4>
        <p>Нажмите иконку 🌙 (или ☀️) в правом верхнем углу. Интерфейс переключится между тёмной и светлой темой. Выбор сохраняется для вашего браузера.</p>

        <h4>Личный кабинет</h4>
        <p>Откройте иконку 👤 справа вверху. Здесь можно:</p>
        <ul>
          <li>создать НЭП, если её ещё нет;</li>
          <li>посмотреть статус сертификата;</li>
          <li>сменить пароль от входа.</li>
        </ul>
      `
    },

    {
      id: 'faq',
      num: '9',
      title: 'Частые вопросы',
      html: `
        <h3>Частые вопросы</h3>

        <h4>Кто видит мой документ?</h4>
        <p>Только те пользователи и группы, которым вы дали доступ, и те, кто получил документ на подпись. Остальные его не видят.</p>

        <h4>Отправил документ, но подписал не тот человек. Как отменить?</h4>
        <p>Попросите получателя нажать <strong>«Отменить подпись»</strong> и указать причину. Документ сразу получит статус «Не утверждён».</p>

        <h4>Можно изменить документ после подписи?</h4>
        <p>Нет. После отправки на подпись название, категория и сам файл менять нельзя — это требование электронного документооборота.</p>

        <h4>Забыл пароль НЭП. Что делать?</h4>
        <p>Пароль НЭП восстановить невозможно. Обратитесь к администратору: придётся создать новую подпись. Старые подписи продолжают действовать.</p>

        <h4>Как отозвать доступ у пользователя?</h4>
        <p>Откройте черновик → <strong>«Редактировать»</strong> → в блоке «Предоставить доступ» снимите галочку → <strong>«Сохранить»</strong>.</p>

        <h4>Не приходят уведомления.</h4>
        <p>Проверьте значок 🔔 — все события хранятся там. Если значок не обновляется — обновите страницу (Ctrl + Shift + R).</p>

        <h4>Не вижу документ, хотя должны.</h4>
        <p>Уточните у отправителя, дал ли он доступ именно вам или вашей группе. Если нет — попросите открыть доступ через редактирование.</p>

        <h4>Не работает кнопка «Сохранить».</h4>
        <p>Убедитесь, что статус документа — <strong>«Черновик»</strong>. Для остальных статусов правка отключена.</p>

        <h4>Забыл пароль от входа.</h4>
        <p>Обратитесь к администратору сервиса.</p>
      `
    }
  ];

  function ensureHelpDom() {
    let overlay = document.getElementById('help-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.className = 'help-overlay';
    overlay.innerHTML = `
      <div class="help-dialog">
        <div class="help-head">
          <h2><span class="help-badge">?</span> Руководство пользователя</h2>
          <div style="display:flex;gap:4px">
            <button class="help-icon-btn" id="help-expand" title="Развернуть">⛶</button>
            <button class="help-close" id="help-close" aria-label="Закрыть">✕</button>
          </div>
        </div>
        <div class="help-body">
          <nav class="help-nav" id="help-nav">
            <div class="help-group">Разделы</div>
            ${HELP_SECTIONS.map(s => `
              <button type="button" data-help-id="${s.id}">
                <span class="help-num">${s.num}.</span>${s.title}
              </button>`).join('')}
          </nav>
          <div class="help-content" id="help-content"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeHelp();
    });
    overlay.querySelector('#help-close').addEventListener('click', closeHelp);
    overlay.querySelector('#help-expand').addEventListener('click', () => {
      overlay.querySelector('.help-dialog').classList.toggle('help-full');
    });

    overlay.querySelectorAll('[data-help-id]').forEach(btn => {
      btn.addEventListener('click', () => showSection(btn.dataset.helpId));
    });

    return overlay;
  }

  function showSection(id) {
    const overlay = document.getElementById('help-overlay');
    if (!overlay) return;
    const sec = HELP_SECTIONS.find(s => s.id === id) || HELP_SECTIONS[0];

    overlay.querySelectorAll('[data-help-id]').forEach(b => {
      b.classList.toggle('active', b.dataset.helpId === sec.id);
    });

    const content = overlay.querySelector('#help-content');
    content.innerHTML = sec.html;
    content.scrollTop = 0;
  }

  function openHelp() {
    const overlay = ensureHelpDom();
    overlay.style.display = 'flex';
    if (!overlay.dataset.inited) {
      showSection(HELP_SECTIONS[0].id);
      overlay.dataset.inited = '1';
    }
  }

  function closeHelp() {
    const overlay = document.getElementById('help-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-help');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openHelp();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHelp();
    });
  });

  window.openHelp  = openHelp;
  window.closeHelp = closeHelp;
})();
