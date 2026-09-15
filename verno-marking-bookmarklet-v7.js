/**
 * Bookmarklet для быстрой разметки диалогов бота в JCP меткой "Верно"
 * + ВИЗУАЛЬНАЯ ПОДСВЕТКА сообщений, которые были размечены автоматически,
 *   чтобы разметчику было легко визуально найти их и перепроверить глазами.
 *
 * Что делает:
 * 1. Ставит "Верно" и фамилию проверяющего в верхней панели диалога.
 * 2. Проходит по всем сообщениям (Message_container) диалога.
 * 3. Для каждого сообщения решает, нужно ли его пропустить (см. правила
 *    ниже). Если сообщение НЕ пропущено — оно:
 *      а) получает оранжевую рамку слева + лёгкую подсветку фона,
 *         чтобы визуально выделяться на странице;
 *      б) размечается меткой "Верно".
 *    Сообщения, попавшие под правила пропуска, остаются без изменений
 *    и без подсветки — их разметчику трогать не нужно.
 *
 * ПРАВИЛА ПРОПУСКА (shouldSkip) — не размечаем и не подсвечиваем:
 *
 *  Приоритетные исключения — ВСЕГДА размечаем и подсвечиваем:
 *    - noMatch в классе ИЛИ стейте (без учёта регистра);
 *    - TransferToOperator в классе ИЛИ стейте, если не совпала разрешённая
 *      пара. Приветствие, кнопка и техническая ошибка не отменяют проверку.
 *
 *  A. isSkipByClassOrState — три независимые группы правил:
 *    - SKIP_CLASSES: подстрока проверяется ТОЛЬКО в классе;
 *    - SKIP_STATES: подстрока проверяется ТОЛЬКО в стейте;
 *    - SKIP_CLASS_STATE_PAIRS: одновременно совпадают класс И стейт.
 *      Все подстроки в правилах записываются в нижнем регистре.
 *
 *    Самостоятельное правило класса: Selling.
 *    Самостоятельные правила стейта: AnyError, FileEvent, TimeoutHandler,
 *    LimitHandler.
 *    Clarity используется только в паре:
 *      class содержит generalstates/clarity
 *      И state содержит generalstates/transfertooperator.
 *    TransferToOperator сам по себе не является причиной пропуска.
 *
 *  B. isButtonClickResponse — реплика клиента дословно совпадает с текстом
 *     одной из кнопок быстрого ответа в предыдущем сообщении бота.
 *
 *  C. isGreetingMessage — сообщение клиента целиком (после нормализации)
 *     является чистым приветствием (regex по GREETING_PATTERNS). Проверка
 *     идёт ТОЛЬКО по тексту клиента, а не по ответу бота или его классу/
 *     стейту. Если после приветствия есть любой другой текст ("Здравствуйте,
 *     где моя карта?") — правило НЕ срабатывает, сообщение размечается.
 *
 *  C2. isGoodbyeMessage — сообщение клиента целиком совпадает с одной из
 *      фраз GOODBYE_PHRASES (точный список, без regex). Та же логика:
 *      любой доп. текст рядом с прощанием отменяет пропуск.
 *
 *  C3. isThanksMessage — то же самое для чистой благодарности клиента
 *      (THANKS_PHRASES), отдельно от приветствий/прощаний.
 *
 *  D. isTechnicalErrorText — ответ бота содержит фиксированный текст
 *     технической ошибки ("Возникла техническая ошибка. Пожалуйста, для
 *     продолжения консультации обратитесь на горячую линию банка по
 *     номеру 8-800-250-57-57."). Проверяется по тексту, а не по классу/
 *     стейту, т.к. ошибка может произойти в любом сценарии — класс/стейт
 *     в таком случае покажет место, где произошла ошибка, а не AnyError.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 * Bookmarklet — вставлять в поле URL закладки ОДНОЙ строкой, начиная строго
 * с "javascript:". Готовая минифицированная версия — рядом, в файле
 * verno-marking-bookmarklet-v7.min.js.
 *
 * ПРИ ИЗМЕНЕНИИ БОТА:
 * - Новые безопасные классы -> SKIP_CLASSES.
 * - Новые безопасные стейты -> SKIP_STATES.
 * - Безопасные сочетания класса И стейта -> SKIP_CLASS_STATE_PAIRS.
 * - Новые формулировки приветствий -> GREETING_PATTERNS (regex).
 * - Новые формулировки прощаний -> GOODBYE_PHRASES (точный список).
 * - Новые формулировки благодарностей -> THANKS_PHRASES (точный список).
 * - Изменение цвета/стиля подсветки -> HIGHLIGHT_STYLE ниже.
 */

javascript:(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

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

  // --- Правило A: отдельные правила класса, стейта и их сочетаний ---
  // Значения правил — нормализованные подстроки в нижнем регистре.
  const SKIP_CLASSES = [
    'selling',
  ];

  const SKIP_STATES = [
    'anyerror',
    'fileevent',
    'timeouthandler',
    'limithandler',
  ];

  const SKIP_CLASS_STATE_PAIRS = [
    {
      cls: 'generalstates/clarity',
      state: 'generalstates/transfertooperator',
    },
  ];

  const hasNoMatch = ({ cls, state }) =>
    cls.includes('nomatch') || state.includes('nomatch');

  const hasTransferToOperator = ({ cls, state }) =>
    cls.includes('transfertooperator') || state.includes('transfertooperator');

  const isSkipByClassOrState = (container) => {
    const classAndState = getClassAndState(container);
    const { cls, state } = classAndState;

    // noMatch имеет приоритет даже при совпадении безопасного правила.
    if (hasNoMatch(classAndState)) return false;

    const skipByClass = SKIP_CLASSES.some((sub) => cls.includes(sub));
    const skipByState = SKIP_STATES.some((sub) => state.includes(sub));
    const skipByPair = SKIP_CLASS_STATE_PAIRS.some(
      (rule) => cls.includes(rule.cls) && state.includes(rule.state)
    );

    // Для TransferToOperator допустимо только парное правило.
    if (hasTransferToOperator(classAndState)) return skipByPair;

    return skipByClass || skipByState || skipByPair;
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

  // --- Правило C: чистое приветствие или прощание — проверка ТОЛЬКО по тексту клиента ---
  const getClientRawText = (container) => {
    if (!container) return '';
    const el = container.querySelector('.qa-field.qa-question');
    return el ? el.innerText : '';
  };

  const normalizeClientText = (text) =>
    (text || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');

  const GREETING_PATTERNS = [
    /^(?:добрый день|доброго дня|день добрый)$/,
    /^(?:добрый вечер|доброго вечера)$/,
    /^(?:доброе утро|доброго утра)$/,
    /^доброй ночи$/,
    /^здравств(?:уйте|уй)$/,
    /^привет(?:ствую)?$/,
    /^доброго времени суток$/,
  ];

  const isPureGreeting = (text) => {
    const normalized = normalizeClientText(text);
    return GREETING_PATTERNS.some((pattern) => pattern.test(normalized));
  };

  const GOODBYE_PHRASES = [
    'пока',
    'до свидания',
    'всего доброго',
    'всего хорошего',
    'до встречи',
    'прощайте',
  ];

  const isPureGoodbye = (text) => {
    const normalized = normalizeClientText(text);
    return GOODBYE_PHRASES.includes(normalized);
  };

  const isGreetingMessage = (container) => isPureGreeting(getClientRawText(container));
  const isGoodbyeMessage = (container) => isPureGoodbye(getClientRawText(container));

  // --- Правило C2: чистая благодарность клиента (отдельно от приветствий/прощаний) ---
  const THANKS_PHRASES = [
    'спасибо', 'спасибо большое', 'большое спасибо', 'благодарю',
    'благодарю вас', 'спасибо огромное',
  ];

  const isThanksMessage = (container) => {
    const normalized = normalizeClientText(getClientRawText(container));
    return THANKS_PHRASES.includes(normalized);
  };

  // --- Текст ответа бота (используется только для проверки технической ошибки) ---
  const getBotText = (container) => {
    const answer = container.querySelector('.qa-field.qa-answer');
    if (!answer) return '';
    const clone = answer.cloneNode(true);
    const label = clone.querySelector('.phrases-messages--qa-bottom-text');
    if (label) label.remove();
    clone.querySelectorAll('button').forEach((b) => b.remove());
    return norm(clone.innerText);
  };

  // --- Правило D: техническая ошибка по тексту ответа бота ---
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
    const classAndState = getClassAndState(container);

    // Эти проверки идут раньше ВСЕХ правил пропуска, включая текст и кнопки.
    if (hasNoMatch(classAndState)) return false;
    if (hasTransferToOperator(classAndState)) {
      return isSkipByClassOrState(container);
    }

    return (
      isSkipByClassOrState(container) ||
      isButtonClickResponse(container, prevContainer) ||
      isGreetingMessage(container) ||
      isGoodbyeMessage(container) ||
      isThanksMessage(container) ||
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
    await sleep(300);
  }

  // 2. Верхняя панель: "Верно" для всего диалога (кликаем второй)
  const topLabelsButtons = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ];
  let topBtn = topLabelsButtons.find((b) => b.innerText.trim() === 'Верно');
  if (topBtn) {
    topBtn.click();
    await sleep(300);
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
      await sleep(300);
    }
  }

  await sleep(500);
  console.log('Готово.');
})();
