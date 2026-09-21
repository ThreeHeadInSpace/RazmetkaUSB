/**
 * Bookmarklet для быстрой разметки диалогов бота в JCP меткой "Верно"
 * + ВИЗУАЛЬНАЯ ПОДСВЕТКА сообщений, которые были размечены автоматически,
 *   чтобы разметчику было легко визуально найти их и перепроверить.
 *
 * Что делает:
 * 1. Ставит "Верно" и фамилию проверяющего в верхней панели диалога.
 * 2. Проходит по всем сообщениям (Message_container) диалога.
 * 3. Для каждого сообщения решает, нужно ли его пропустить (см. правила
 *    ниже). Если сообщение НЕ пропущено — оно:
 *      а) получает оранжевую рамку + лёгкую подсветку фона,
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
 *    Самостоятельное правило класса: Selling (Пропускается в любом случае)
 *    Самостоятельные правила стейта: AnyError, FileEvent, TimeoutHandler,
 *    LimitHandler. (Пропускаются в любом случае)
 * 
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
 *  C2. isGoodbyeMessage — сообщение клиента целиком (после нормализации)
 *      совпадает с одним из паттернов GOODBYE_PATTERNS (regex, покрывает
 *      варианты написания вроде "до свидания"/"досвидания"/"досвидос").
 *      Та же логика: любой доп. текст рядом с прощанием отменяет пропуск.
 *
 *  C3. isThanksMessage — то же самое для чистой благодарности клиента
 *      (THANKS_PATTERNS, regex), отдельно от приветствий/прощаний.
 *
 *  D. isTechnicalErrorText — ответ бота содержит фиксированный текст
 *     технической ошибки ("Возникла техническая ошибка. Пожалуйста, для
 *     продолжения консультации обратитесь на горячую линию банка по
 *     номеру 8-800-250-57-57."). Проверяется по тексту, а не по классу/
 *     стейту, т.к. ошибка может произойти в любом сценарии — класс/стейт
 *     в таком случае покажет место, где произошла ошибка, а не AnyError.
 *
 *  E. isPureOperatorRequest — чистый запрос клиента на перевод к человеку.
 *     Проверяется по полному нормализованному тексту клиента и НЕ зависит
 *     от Class/State = Clarity. Regex привязан к началу и концу сообщения
 *     (^...$), поэтому банковские вопросы, в которых просто встречаются
 *     слова "оператор", "специалист" и т.п. ("Оператор списал деньги с
 *     карты", "Мне специалист сказал, что платёж не прошёл"), НЕ
 *     пропускаются — пропускается только сообщение, целиком являющееся
 *     обращением/просьбой позвать человека. Приоритетный noMatch и
 *     правила TransferToOperator (правило A2) сохраняются как есть.
 *
 *  F. isNoMoreQuestionsMessage — класс СТРОГО равен /DontHaveQuestions
 *     И текст клиента — чистая фраза из NO_MORE_QUESTIONS_PATTERNS ("нет",
 *     "нет спасибо", "всё", "вопросов больше нет" и т.п.). /DontHaveQuestions
 *     специально НЕ добавлен в SKIP_CLASSES целиком — пропуск разрешён
 *     только для этих конкретных фраз, чтобы не потерять реальный ответ
 *     клиента, если он неожиданно попал в этот класс.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 * Bookmarklet — вставлять в поле URL закладки ОДНОЙ строкой, начиная строго
 * с "javascript:". Готовая минифицированная версия — рядом, в файле
 * verno-marking-bookmarklet-v8.5.min.js.
 *
 * ВАЖНО: Кнопе не доверять, разметку перепроверять.
 *
 * ПРИ ИЗМЕНЕНИИ БОТА:
 * - Новые безопасные классы -> SKIP_CLASSES.
 * - Новые безопасные стейты -> SKIP_STATES.
 * - Безопасные сочетания класса И стейта -> SKIP_CLASS_STATE_PAIRS.
 * - Новые формулировки приветствий -> GREETING_PATTERNS (regex).
 * - Новые формулировки прощаний -> GOODBYE_PATTERNS (regex).
 * - Новые формулировки благодарностей -> THANKS_PATTERNS (regex).
 * - Изменение цвета/стиля подсветки -> HIGHLIGHT_STYLE ниже.
 */

javascript:(async () => {
  console.log('verno-marking-bookmarklet v8.5 запущен');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const containers = [...document.querySelectorAll('div.Message_container')];

  // --- Класс / Стейт сообщения ---
  // ВАЖНО: элемент содержит подпись-лейбл ("Класс:"/"Стейт:") слитно со
  // значением. Вырезаем лейбл, чтобы cls/state были ЧИСТЫМИ значениями —
  // это нужно для строгого сравнения (===) в новых правилах ниже.
  const getClassAndState = (container) => {
    if (!container) return { cls: '', state: '' };
    const extractValue = (el) => {
      if (!el) return '';
      const clone = el.cloneNode(true);
      const label = clone.querySelector('.Message_label');
      if (label) label.remove();
      return norm(clone.innerText);
    };
    const clsEl = container.querySelector('[data-test-id="phraseClass"]');
    const stateEl = container.querySelector('[data-test-id="phraseState"]');
    return {
      cls: extractValue(clsEl),
      state: extractValue(stateEl),
    };
  };

  // --- Правило A: отдельные правила класса, стейта и их сочетаний ---
  // Значения правил — нормализованные подстроки в нижнем регистре.
  const SKIP_CLASSES = [
    'selling',
    '/handlers/timeouthandler',
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

  const GOODBYE_PATTERNS = [
    /^пока$/,
    /^до\s*свидания$/,                         // "до свидания" + "досвидания"
    /^досвидос$/,
    /^всего(?:\s+вам)?\s+(?:доброго|хорошего)$/,
    /^хорошего\s+(?:дня|вечера)(?:\s+вам)?$/,
    /^до\s+встречи$/,
    /^прощай(?:те)?$/,
  ];

  const isPureGoodbye = (text) => {
    const normalized = normalizeClientText(text);
    return GOODBYE_PATTERNS.some((pattern) => pattern.test(normalized));
  };

  const isGreetingMessage = (container) => isPureGreeting(getClientRawText(container));
  const isGoodbyeMessage = (container) => isPureGoodbye(getClientRawText(container));

  // --- Правило C2: чистая благодарность клиента (отдельно от приветствий/прощаний) ---
  const THANKS_PATTERNS = [
    /^спасибо(?:\s+вам)?(?:\s+(?:большое|огромное|огромнейшее|большущее))?$/,
    /^(?:большое|огромное|огромнейшее)\s+спасибо(?:\s+вам)?$/,
    /^благодарю(?:\s+вас)?$/,
  ];

  const isPureThanks = (text) => {
    const normalized = normalizeClientText(text);
    return THANKS_PATTERNS.some((pattern) => pattern.test(normalized));
  };

  const isThanksMessage = (container) => isPureThanks(getClientRawText(container));

  // --- Правило E: точный запрос оператора (класс Clarity + текст = запрос человека) ---
  // Работает ТОЛЬКО когда класс сообщения строго равен /GeneralStates/Clarity —
  // это значит, что бот САМ определил запрос как Clarity (не доверяем
  // одному только тексту клиента). Решает ситуацию "Оператор -> Clarity ->
  // Clarity" (класс=стейт=Clarity), не задевая реальные банковские вопросы,
  // которые тоже иногда попадают в Clarity.
  const HUMAN_ROLE =
    '(?:оператор[а-яё]*|специалист[а-яё]*|сотрудник[а-яё]*|консультант[а-яё]*|менеджер[а-яё]*|(?:жив[а-яё]+\\s+)?человек[а-яё]*)';

  const OPERATOR_PATTERNS = [
    new RegExp('^' + HUMAN_ROLE + '$'),

    new RegExp(
      '^(?:мне\\s+)?(?:нужен|нужна|нужны)\\s+' + HUMAN_ROLE + '$'
    ),

    new RegExp(
      '^(?:позови(?:те)?|пригласи(?:те)?|дай(?:те)?|подключи(?:те)?|зови(?:те)?)\\s+(?:мне\\s+)?' + HUMAN_ROLE + '$'
    ),

    new RegExp(
      '^(?:соедини(?:те)?|свяжи(?:те)?)(?:\\s+меня)?\\s+(?:с|со)\\s+' + HUMAN_ROLE + '$'
    ),

    new RegExp(
      '^(?:переведи(?:те)?|переключи(?:те)?)(?:\\s+меня)?\\s+на\\s+' + HUMAN_ROLE + '$'
    ),

    new RegExp(
      '^(?:как\\s+)?(?:связаться|поговорить)\\s+с\\s+' + HUMAN_ROLE + '$'
    ),

    new RegExp(
      '^(?:связь|соединение)\\s+(?:с|со)\\s+' + HUMAN_ROLE + '$'
    ),
  ];

  const isPureOperatorRequest = (container) => {
    const normalized = normalizeClientText(
      getClientRawText(container)
    )
      // Пунктуация убирается ДО удаления слова "пожалуйста": иначе в
      // "Пожалуйста, соедините..." запятая сразу после слова мешает
      // границе \s|$ сработать, и слово не вырезается.
      .replace(/[,.!?;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(?:^|\s)пожалуйста(?:\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return OPERATOR_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    );
  };

  // --- Правило F: "вопросов больше нет" (класс DontHaveQuestions + чистая фраза) ---
  // /DontHaveQuestions НЕ добавлен в SKIP_CLASSES специально: пропуск разрешён
  // только для явных фраз ("нет", "нет спасибо", "всё", "вопросов больше нет"),
  // а не для класса целиком — иначе можно случайно съесть реальный ответ клиента.
  const NO_MORE_QUESTIONS_PATTERNS = [
    /^нет$/,
    /^нет[\s,.]*(?:спасибо|спс|пасиб[оа]?|спосибо)(?:\s+(?:большое|огромное))?$/,
    /^нет\s+не\s+нужно\s+спасибо$/,
    /^(?:всё|все)(?:[\s,.]+спасибо)?$/,
    /^(?:спасибо[\s,.]*)?(?:вопросов\s+(?:больше\s+)?нет|больше\s+вопросов\s+нет|нет\s+больше\s+вопросов)$/,
  ];

  const isNoMoreQuestionsMessage = (container) => {
    const { cls } = getClassAndState(container);

    if (cls !== '/donthavequestions') return false;

    const normalized = normalizeClientText(
      getClientRawText(container)
    );

    return NO_MORE_QUESTIONS_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    );
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

  // Единый источник истины: какая именно причина пропуска сработала (или
  // null, если сообщение нужно размечать). Используется и в реальной
  // разметке, и в диагностике консоли — чтобы они не могли разойтись.
  const getSkipReason = (container, prevContainer) => {
    const classAndState = getClassAndState(container);

    // noMatch — абсолютный приоритет на ручную проверку, отменяет всё ниже.
    if (hasNoMatch(classAndState)) return null;

    if (hasTransferToOperator(classAndState)) {
      return isSkipByClassOrState(container) ? 'clarityTransferToOperatorPair' : null;
    }

    if (isSkipByClassOrState(container)) return 'classOrState';
    if (isButtonClickResponse(container, prevContainer)) return 'buttonClick';
    if (isGreetingMessage(container)) return 'greeting';
    if (isGoodbyeMessage(container)) return 'goodbye';
    if (isThanksMessage(container)) return 'thanks';
    if (isTechnicalErrorText(container)) return 'technicalError';
    if (isPureOperatorRequest(container)) return 'pureOperatorRequest';
    if (isNoMoreQuestionsMessage(container)) return 'noMoreQuestions';

    return null;
  };

  const shouldSkip = (container, prevContainer) =>
    getSkipReason(container, prevContainer) !== null;

  const getVernoButtonInContainer = (container) => {
    return [...container.querySelectorAll('button.Message_label_button')].find(
      (b) => b.innerText.trim() === 'Верно'
    );
  };

  // --- Визуальная подсветка сообщений, требующих внимания/размеченных ---
  const HIGHLIGHT_STYLE = {
    borderLeft: '5px solid #ff8c00',
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
    const skipReason = getSkipReason(c, containers[i - 1]);
    const skip = skipReason !== null;
    if (skip) skippedCount++; else markedCount++;
    console.log('Сообщение №' + (i + 1), {
      cls,
      state,
      clientText: getClientText(c),
      willSkip: skip,
      skipReason: skipReason || null,
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

  await sleep(50);
  console.log('Готово.');
})();
