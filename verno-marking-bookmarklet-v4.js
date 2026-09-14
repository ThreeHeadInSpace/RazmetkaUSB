/**
 * Bookmarklet для быстрой "Пред-разметки" диалогов бота в JACP
 * + ВИЗУАЛЬНАЯ ПОДСВЕТКА сообщений, которые были размечены автоматически,
 *   чтобы разметчику было легко визуально найти их и перепроверить.
 *
 * Что делает:
 * 1. Ставит Фамилию и метку "Верно" на сессию.
 * 2. Проходит по всем сообщениям (Message_container) диалога.
 * 3. Для каждого сообщения решает, нужно ли его пропустить (правила
 *    ниже). Если сообщение НЕ пропущено — оно:
 *      а) получает оранжевую рамку +  подсветку фона,
 *         чтобы визуально выделяться на странице;
 *      б) размечается меткой "Верно".
 *    Сообщения, попавшие под правила пропуска, остаются без изменений
 *    и без подсветки, их трогать не нужно.
 *
 * ПРАВИЛА ПРОПУСКА (shouldSkip) не размечаем и не подсвечиваем:
 *
 *  A. isSkipByClassOrState — Класс или Стейт содержит одну из подстрок
 *     SKIP_CLASS_STATE_SUBSTRINGS:
 *       - generalstates/clarity  — клиент написал только "Оператор" одним
 *         словом, бот переспрашивает вопрос
 *       - anyerror               — техническая ошибка (в т.ч. ошибка кнопки) -> уходит в бэклог автоматически
 *       - fileevent              — отправка файла
 *       - timeouthandler         — молчание 15 минут -> закрытие сессии
 *       - limithandler           — сообщение > 3000 символов -> просьба сократить
 *       - selling                — авто-сообщения ветки Selling/ (Selling, Selling/ChooseOffer, Selling/ChooseOffer/Card, 
 * Selling/CreditCard, Selling/ApprovedLoan, Selling/PreapprovedLoan, Selling/ResponseToOffers)
 *       - generalstates/transfertooperator — запрос специалиста/оператора,
 *         бот переключает на специалиста
 *
 *  B. isButtonClickResponse — реплика клиента дословно совпадает с текстом
 *     одной из кнопок быстрого ответа в предыдущем сообщении бота.
 *
 *  C. isShortClientPhrase — сообщение клиента целиком состоит из короткой
 *     фразы (приветствие/благодарность/прощание) из SHORT_CLIENT_PHRASES.
 *
 *  D. isPureGreeting — ответ бота — ровно одна из приветственных фраз
 *     HelloHandler (SayRandom), без доп. текста.
 *
 *  E. isTechnicalErrorText — ответ бота содержит фиксированный текст
 *     технической ошибки ("Возникла техническая ошибка. Пожалуйста, для
 *     продолжения консультации обратитесь на горячую линию банка по
 *     номеру 8-800-250-57-57."). Проверяется по тексту, а не по классу/
 *     стейту, т.к. ошибка может произойти в любом сценарии — класс/стейт
 *     в таком случае покажет место, где произошла ошибка, а не AnyError.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 * Bookmarklet — вставлять в поле URL закладки ОДНОЙ строкой, начиная строго
 * с "javascript:". Готовая минифицированная версия — рядом, в файле
 * verno-marking-bookmarklet-v4.min.js.
 *
 * ПРИ ИЗМЕНЕНИИ БОТА:
 * - Новые классы/стейты для пропуска -> SKIP_CLASS_STATE_SUBSTRINGS.
 * - Новые формулировки приветствий/прощаний -> SHORT_CLIENT_PHRASES.
 * - Изменение цвета/стиля подсветки -> HIGHLIGHT_STYLE ниже.
 */

javascript:(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const stripPunct = (t) => t.replace(/^[\s!?.,;:]+|[\s!?.,;:]+$/g, '');

  const containers = [...document.querySelectorAll('div.Message_container')];

  // --- Класс / Стейт сообщения ---
  const getClassAndState = (container) => {
    if (!container) return { cls: '', state: '' };
    const clsEl = container.querySelector('[data-test-id="phraseClass"]');
    const stateEl = container.querySelector('[data-test-id="phraseState"]');
    return {
      cls: norm(clsEl ? clsEl.innerText : ''),
      state: norm(stateEl ? stateEl.innerText : ''),
    };
  };

  // --- Правило A: пропуск по классу/стейту ---
  const SKIP_CLASS_STATE_SUBSTRINGS = [
    'generalstates/clarity',
    'generalstates/transfertooperator', // запрос специалиста/оператора -> не размечаем
    'anyerror',
    'fileevent',
    'timeouthandler',
    'limithandler',
    'selling',
  ];

  const isSkipByClassOrState = (container) => {
    const { cls, state } = getClassAndState(container);
    return SKIP_CLASS_STATE_SUBSTRINGS.some(
      (sub) => cls.includes(sub) || state.includes(sub)
    );
  };

  // --- Правило B: реплика клиента = нажатие кнопки быстрого ответа ---
  const getClientText = (container) => {
    if (!container) return '';
    const el = container.querySelector('.qa-field.qa-question');
    return el ? norm(el.innerText) : '';
  };

  const getQuickReplyTexts = (container) => {
    if (!container) return [];
    return [...container.querySelectorAll('.qa-field.qa-answer button.btn-outline-info')]
      .map((b) => norm(b.innerText));
  };

  const isButtonClickResponse = (container, prevContainer) => {
    const clientText = getClientText(container);
    if (!clientText || !prevContainer) return false;
    return getQuickReplyTexts(prevContainer).includes(clientText);
  };

  // --- Правило C: короткая фраза клиента ---
  const SHORT_CLIENT_PHRASES = [
    'привет', 'приветик', 'здравствуйте', 'здравствуй',
    'добрый день', 'добрый вечер', 'доброй ночи', 'доброе утро',
    'спасибо', 'спасибо большое', 'большое спасибо', 'благодарю',
    'благодарю вас', 'спасибо огромное',
    'пока', 'до свидания', 'всего доброго', 'всего хорошего',
    'до встречи', 'прощайте',
  ];

  const isShortClientPhrase = (container) => {
    const text = stripPunct(getClientText(container));
    if (!text) return false;
    return SHORT_CLIENT_PHRASES.includes(text);
  };

  // --- Правило D: чистое приветствие бота (HelloHandler) ---
  const getBotText = (container) => {
    const answer = container.querySelector('.qa-field.qa-answer');
    if (!answer) return '';
    const clone = answer.cloneNode(true);
    const label = clone.querySelector('.phrases-messages--qa-bottom-text');
    if (label) label.remove();
    clone.querySelectorAll('button').forEach((b) => b.remove());
    return norm(clone.innerText);
  };

  const NAME_TOKEN = '{name}';
  const greetingTemplates = [
    'приветствую вас! на связи уралсиб-бот.',
    'рад приветствовать вас! с вами уралсиб-бот.',
    'здравствуйте! на связи уралсиб-бот.',
    'приветствую вас, ' + NAME_TOKEN + '! на связи уралсиб-бот.',
    'рад приветствовать вас, ' + NAME_TOKEN + '! с вами уралсиб-бот.',
    'здравствуйте, ' + NAME_TOKEN + '! я уралсиб-бот, цифровой помощник банка.',
  ];

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const greetingRegexes = greetingTemplates.map((t) => {
    const escaped = escapeRegex(t).replace(escapeRegex(NAME_TOKEN), '.+?');
    return new RegExp('^' + escaped + '$');
  });

  const isPureGreeting = (container) => {
    const text = getBotText(container);
    if (!text) return false;
    return greetingRegexes.some((re) => re.test(text));
  };

  // --- Правило E: техническая ошибка по тексту ответа бота ---
  // Может встретиться в ЛЮБОМ классе/стейте (там показывается тот класс/стейт,
  // где произошла ошибка), поэтому ищем именно по фиксированному тексту,
  // а не полагаемся только на класс/стейт AnyError.
  const TECHNICAL_ERROR_TEXT = norm(
    'Возникла техническая ошибка. Пожалуйста, для продолжения консультации ' +
    'обратитесь на горячую линию банка по номеру 8-800-250-57-57.'
  );

  const isTechnicalErrorText = (container) => {
    const text = getBotText(container);
    if (!text) return false;
    return text.includes(TECHNICAL_ERROR_TEXT);
  };

  // Общая точка расширения для правил пропуска
  const shouldSkip = (container, prevContainer) => {
    return (
      isSkipByClassOrState(container) ||
      isButtonClickResponse(container, prevContainer) ||
      isShortClientPhrase(container) ||
      isPureGreeting(container) ||
      isTechnicalErrorText(container)
    );
  };

  const getVernoButtonInContainer = (container) => {
    return [...container.querySelectorAll('button.Message_label_button')].find(
      (b) => b.innerText.trim() === 'Верно'
    );
  };

  // --- Визуальная подсветка сообщений, требующих внимания/размеченных ---
  const HIGHLIGHT_STYLE = {
    borderLeft: '5px solid #ff8c00',       // насыщенный оранжевый
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    paddingLeft: '10px',
    borderRadius: '4px',
  };

  const highlightContainer = (container) => {
    Object.assign(container.style, HIGHLIGHT_STYLE);
    // Небольшая метка-бейдж в начале блока, чтобы глаз цеплялся сразу
    if (!container.querySelector('.auto-mark-badge')) {
      const badge = document.createElement('div');
      badge.className = 'auto-mark-badge';
      badge.textContent = '● Размечено автоматически — проверьте';
      badge.style.color = '#ff8c00';
      badge.style.fontWeight = 'bold';
      badge.style.fontSize = '12px';
      badge.style.marginBottom = '4px';
      container.insertBefore(badge, container.firstChild);
    }
  };

  // 1. Верхняя панель: фамилия проверяющего (кликаем первой)
  let surnameBtn = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ].find((b) => b.innerText.trim() === '.Ведерников И. Ю.');
  if (surnameBtn) {
    surnameBtn.click();
    await sleep(50);
  }

  // 2. Верхняя панель: "Верно" для всего диалога (кликаем второй)
  const topLabelsButtons = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ];
  let topBtn = topLabelsButtons.find((b) => b.innerText.trim() === 'Верно');
  if (topBtn) {
    topBtn.click();
    await sleep(50);
  }

  // 3. Диагностика в консоль
  let markedCount = 0;
  let skippedCount = 0;
  containers.forEach((c, i) => {
    const { cls, state } = getClassAndState(c);
    const skip = shouldSkip(c, containers[i - 1]);
    if (skip) skippedCount++; else markedCount++;
    console.log('Сообщение №' + (i + 1), {
      cls,
      state,
      clientText: getClientText(c),
      willSkip: skip,
    });
  });
  console.log('Итого: размечено ' + markedCount + ', пропущено ' + skippedCount);

  // 4. Кликаем "Верно" в каждом сообщении, подсвечиваем размеченные, пропускаем нужные
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const prev = containers[i - 1];
    if (shouldSkip(container, prev)) continue;

    const btn = getVernoButtonInContainer(container);
    if (btn) {
      btn.click();
      highlightContainer(container);
      await sleep(50);
    }
  }

  await sleep(55);
  console.log('Готово.');
})();
