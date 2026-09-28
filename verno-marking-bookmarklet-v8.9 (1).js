/**
 * Bookmarklet для быстрой разметки диалогов бота в JCP меткой "Верно"
 * + ВИЗУАЛЬНАЯ ПОДСВЕТКА сообщений, которые были размечены автоматически,
 *   чтобы разметчику было легко визуально найти их и перепроверить глазами.
 *
 * Что делает:
 * 1. Ставит "Фамилию И.О" проверяющего и метку "Верно" в верхней панели диалога.
 * 2. Проходит по всем сообщениям (Message_container) диалога.
 * 3. Для каждого сообщения решает, нужно ли его пропустить (см. правила
 *    ниже). Если сообщение НЕ пропущено — оно:
 *      а) получает оранжевую рамку слева (#ff8c00) + лёгкую подсветку фона,
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
 *     номеру 8-800-250-57-57." + К сожалению, произошла техническая ошибка. Пожалуйста, обратитесь ' +
      'на горячую линию банка по номеру 8-800-250-57-57.'
    ),
    norm(
      'Возникла техническая ошибка. Пожалуйста, для продолжения консультации ' +
      'обратитесь на горячую линию банка по номеру 8-800-250-57-57). Проверяется по тексту, а не по классу/
 *     стейту, т.к. ошибка может произойти в любом сценарии — класс/стейт
 *     в таком случае покажет место, где произошла ошибка, а не AnyError.
 *
 *  E. isPureOperatorRequest — ВРЕМЕННО ОТКЛЮЧЕНО в v8.9 (см. пункт 5 в списке
 *     изменений ниже). Код и комментарий оставлены как справка на случай
 *     повторного включения в будущем.
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
 * verno-marking-bookmarklet-v8.9.min.js.
 *
 * ВАЖНО: скрипт печатает в консоль строку "verno-marking-bookmarklet v8.9
 * запущен" сразу при запуске — если после обновления закладки в консоли
 * не появляется эта строка (или появляется другая версия), значит в поле
 * URL закладки осталась СТАРАЯ версия кода и её нужно переустановить.
 * Диагностика в консоли также показывает skipReason — конкретную причину
 * пропуска каждого сообщения (или null, если оно должно быть размечено).
 *
 * ИСПРАВЛЕНО В v8.6: убрана блокирующая ветка в getSkipReason, из-за
 * которой ЛЮБОЕ сообщение со стейтом/классом, содержащим "transfertooperator",
 * прекращало проверку остальных правил — даже если точная безопасная связка
 * Clarity+TransferToOperator не подтверждалась. Из-за этого клики по кнопкам
 * меню (например, выбор "Кредитные карты" из списка после "Человек"),
 * приводящие к стейту TransferToOperator, ошибочно оставались размеченными.
 * Теперь связка Clarity+TransferToOperator — рядовой пункт в общей цепочке
 * проверок, не блокирующий остальные (клик по кнопке, запрос оператора и т.д.).
 *
 * ДОБАВЛЕНО В v8.7:
 * 1. Вторая формулировка технической ошибки (TECHNICAL_ERROR_TEXTS, теперь
 *    массив из двух фраз). Если в диалоге встретилась хотя бы одна тех.
 *    ошибка — метка сессии в верхней панели ставится "Тех. ошибка" вместо
 *    "Верно" (фамилия проверяющего ставится в любом случае). Само сообщение
 *    с тех. ошибкой подсвечивается КРАСНЫМ (отдельно от оранжевой подсветки
 *    авторазметки) с бейджем "⚠ Техническая ошибка".
 * 2. isBareOperatorWord — голое слово-обращение ("Оператор", "Человек",
 *    "Специалист" и т.п. БЕЗ вопроса или любого другого текста) теперь
 *    пропускается ВСЕГДА, независимо от класса/стейта, включая noMatch.
 *    Это единственное исключение из приоритета noMatch.
 *
 * ИЗМЕНЕНО В v8.9:
 * 1. При технической ошибке теперь ещё и нажимается кнопка "Ошибка" в
 *    метках самого сообщения (не только красная подсветка + метка сессии).
 * 2. noMatch проверяется ТОЛЬКО по классу (в стейте noMatch не встречается).
 * 3. Новое правило isClarityBothClassState: если И класс, И стейт содержат
 *    "clarity" — сообщение пропускается целиком, независимо от текста
 *    (по результатам аналитики признано безопасным).
 * 4. Из GOODBYE_PATTERNS убран паттерн "всего доброго/хорошего" (ложные
 *    срабатывания).
 * 5. OPERATOR_PATTERNS/isPureOperatorRequest ВРЕМЕННО ОТКЛЮЧЕНЫ — оставлены
 *    закомментированными в читаемой версии для будущего включения, в
 *    минифицированной версии отсутствуют полностью. isBareOperatorWord
 *    (голое слово-обращение) продолжает работать — переписан так, чтобы
 *    строиться напрямую из HUMAN_ROLE, не завися от отключённого блока.
 * 6-7. normalizeClientText теперь убирает пунктуацию ВЕЗДЕ (не только по
 *    краям строки), а не только на границах — это убирает необходимость
 *    дублировать обработку пунктуации (вроде "[\s,.]*") внутри отдельных
 *    regex-паттернов (ответ на комментарий ревью). Заодно упрощён
 *    normalizeForOperatorCheck и убрана опечатка "спосибо" из
 *    NO_MORE_QUESTIONS_PATTERNS.
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
  console.log('verno-marking-bookmarklet v8.9 запущен');
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

  // noMatch встречается только в КЛАССЕ, не в стейте — проверяем строго cls.
  const hasNoMatch = ({ cls }) => cls.includes('nomatch');

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

  // Отдельная (НЕ блокирующая) проверка точной безопасной связки — используется
  // только для диагностики и как один из равноправных пунктов в getSkipReason.
  // В отличие от старой ветки в getSkipReason, отсутствие этой связки НЕ
  // прерывает проверку остальных правил (клик по кнопке, запрос оператора и т.д.).
  const isClarityTransferToOperatorPair = (container) => {
    const { cls, state } = getClassAndState(container);
    return SKIP_CLASS_STATE_PAIRS.some(
      (rule) => cls.includes(rule.cls) && state.includes(rule.state)
    );
  };

  // Класс И стейт ОБА содержат "clarity" (например, классический цикл
  // "Оператор -> Clarity -> Clarity"). По результатам аналитики такой
  // случай безопасен для пропуска целиком, независимо от текста клиента.
  const isClarityBothClassState = ({ cls, state }) =>
    cls.includes('clarity') && state.includes('clarity');

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

  // Убирает ЛЮБУЮ пунктуацию/символы (не только по краям строки, а везде) —
  // централизованно здесь, чтобы отдельные regex-паттерны ниже не дублировали
  // обработку внутренней пунктуации (например, запятой в "Нет, спасибо").
  const normalizeClientText = (text) =>
    (text || '')
      .toLowerCase()
      .replace(/[\p{P}\p{S}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

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

  // --- Правило E: точный запрос оператора (ОТКЛЮЧЕНО, см. ниже) ---
  const HUMAN_ROLE =
    '(?:оператор[а-яё]*|специалист[а-яё]*|сотрудник[а-яё]*|консультант[а-яё]*|менеджер[а-яё]*|(?:жив[а-яё]+\\s+)?человек[а-яё]*)';

  // ОТКЛЮЧЕНО: OPERATOR_PATTERNS/isPureOperatorRequest покрывают
  // более длинные конструкции ("нужен оператор", "соедините с оператором",
  // "переведите на специалиста" и т.п.), но пока не должны применяться —
  // оставлено в коде закомментированным для возможного включения в будущем.
  // В минифицированной версии этот блок отсутствует полностью (комментарии
  // вырезаются минификатором).
  //
  // const OPERATOR_PATTERNS = [
  //   new RegExp('^' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:мне\\s+)?(?:нужен|нужна|нужны)\\s+' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:позови(?:те)?|пригласи(?:те)?|дай(?:те)?|подключи(?:те)?|зови(?:те)?)\\s+(?:мне\\s+)?' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:соедини(?:те)?|свяжи(?:те)?)(?:\\s+меня)?\\s+(?:с|со)\\s+' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:переведи(?:те)?|переключи(?:те)?)(?:\\s+меня)?\\s+на\\s+' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:как\\s+)?(?:связаться|поговорить)\\s+с\\s+' + HUMAN_ROLE + '$'),
  //   new RegExp('^(?:связь|соединение)\\s+(?:с|со)\\s+' + HUMAN_ROLE + '$'),
  // ];
  //
  // const isPureOperatorRequest = (container) => {
  //   const normalized = normalizeForOperatorCheck(container);
  //   return OPERATOR_PATTERNS.some((pattern) => pattern.test(normalized));
  // };

  // Общая нормализация текста клиента для проверок этого блока правил.
  const normalizeForOperatorCheck = (container) =>
    normalizeClientText(getClientRawText(container))
      .replace(/(?:^|\s)пожалуйста(?:\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // --- Правило A0 (проверяется раньше noMatch): голое слово-обращение ---
  // Сообщение состоит ТОЛЬКО из одного слова "оператор"/"специалист"/
  // "сотрудник"/"консультант"/"менеджер"/"человек" (в любой словоформе,
  // с "пожалуйста" или без) — без вопроса и любого другого текста. Такое
  // сообщение пропускаем ВСЕГДА, независимо от класса/стейта, включая
  // noMatch. Строится напрямую из HUMAN_ROLE, НЕ зависит от отключённого
  // блока OPERATOR_PATTERNS выше.
  const BARE_OPERATOR_PATTERN = new RegExp('^' + HUMAN_ROLE + '$');

  const isBareOperatorWord = (container) => {
    const normalized = normalizeForOperatorCheck(container);
    if (!normalized) return false;
    return BARE_OPERATOR_PATTERN.test(normalized);
  };

  // --- Правило F: "вопросов больше нет" (класс DontHaveQuestions + чистая фраза) ---
  // /DontHaveQuestions НЕ добавлен в SKIP_CLASSES специально: пропуск разрешён
  // только для явных фраз ("нет", "нет спасибо", "всё", "вопросов больше нет"),
  // а не для класса целиком — иначе можно случайно съесть реальный ответ клиента.
  const NO_MORE_QUESTIONS_PATTERNS = [
    /^нет$/,
    /^нет\s*(?:спасибо|спс|пасиб[оа]?)(?:\s+(?:большое|огромное))?$/,
    /^нет\s+не\s+нужно\s+спасибо$/,
    /^(?:всё|все)(?:\s+спасибо)?$/,
    /^(?:спасибо\s*)?(?:вопросов\s+(?:больше\s+)?нет|больше\s+вопросов\s+нет|нет\s+больше\s+вопросов)$/,
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
  // а не полагаемся только на класс/стейт AnyError. Бот может выражать
  // техническую ошибку ДВУМЯ разными фразами — проверяем обе.
  const TECHNICAL_ERROR_TEXTS = [
    norm(
      'К сожалению, произошла техническая ошибка. Пожалуйста, обратитесь ' +
      'на горячую линию банка по номеру 8-800-250-57-57.'
    ),
    norm(
      'Возникла техническая ошибка. Пожалуйста, для продолжения консультации ' +
      'обратитесь на горячую линию банка по номеру 8-800-250-57-57.'
    ),
  ];

  const isTechnicalErrorText = (container) => {
    const text = getBotText(container);
    if (!text) return false;
    return TECHNICAL_ERROR_TEXTS.some((phrase) => text.includes(phrase));
  };

  // Единый источник истины: какая именно причина пропуска сработала (или
  // null, если сообщение нужно размечать). Используется и в реальной
  // разметке, и в диагностике консоли — чтобы они не могли разойтись.
  const getSkipReason = (container, prevContainer) => {
    const classAndState = getClassAndState(container);

    // Голое слово-обращение ("Оператор", "Человек" и т.п. без вопроса) —
    // ЕДИНСТВЕННОЕ правило, которое проверяется РАНЬШЕ noMatch и перебивает
    // его: пропускаем независимо от класса/стейта, включая noMatch.
    if (isBareOperatorWord(container)) return 'bareOperatorWord';

    // noMatch — приоритет на ручную проверку для всего остального, отменяет
    // всё ниже (но НЕ отменяет правило выше).
    if (hasNoMatch(classAndState)) return null;

    if (isClarityBothClassState(classAndState)) return 'clarityBoth';

    // ВАЖНО: раньше здесь была блокирующая ветка "if (hasTransferToOperator)
    // return ... : null", которая ПОЛНОСТЬЮ обрывала проверку остальных
    // правил (клик по кнопке, запрос оператора и т.п.) для ЛЮБОГО сообщения,
    // где в классе/стейте встречается 'transfertooperator' — даже если точная
    // безопасная связка Clarity+TransferToOperator не подтвердилась. Из-за
    // этого, например, обычный клик по кнопке меню ("Кредитные карты"),
    // приведший к стейту TransferToOperator, не размечался как клик по кнопке
    // и оставался помеченным "Верно" по умолчанию. Теперь это отдельный
    // равноправный пункт в цепочке, не блокирующий остальные проверки.
    if (isClarityTransferToOperatorPair(container)) return 'clarityTransferToOperatorPair';
    if (isSkipByClassOrState(container)) return 'classOrState';
    if (isButtonClickResponse(container, prevContainer)) return 'buttonClick';
    if (isGreetingMessage(container)) return 'greeting';
    if (isGoodbyeMessage(container)) return 'goodbye';
    if (isThanksMessage(container)) return 'thanks';
    if (isTechnicalErrorText(container)) return 'technicalError';
    // isPureOperatorRequest ВРЕМЕННО ОТКЛЮЧЕНО (см. комментарий у OPERATOR_PATTERNS выше)
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

  // Кнопка "Ошибка" в метках конкретного сообщения (не путать с "Тех. ошибка"
  // в верхней панели, это метка ВСЕЙ сессии).
  const getErrorButtonInContainer = (container) => {
    return [...container.querySelectorAll('button.Message_label_button')].find(
      (b) => b.innerText.trim() === 'Ошибка'
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

  // --- Отдельная КРАСНАЯ подсветка для сообщений с технической ошибкой ---
  // Независима от подсветки "размечено автоматически": сообщение с тех.
  // ошибкой НЕ размечается "Верно" (см. правило isTechnicalErrorText в
  // getSkipReason), но должно визуально бросаться в глаза сразу.
  const TECHNICAL_ERROR_HIGHLIGHT_STYLE = {
    borderLeft: '5px solid #e53935',
    backgroundColor: 'rgba(229, 57, 53, 0.10)',
    paddingLeft: '10px',
    borderRadius: '4px',
  };

  const highlightTechnicalError = (container) => {
    Object.assign(container.style, TECHNICAL_ERROR_HIGHLIGHT_STYLE);
    if (!container.querySelector('.tech-error-badge')) {
      const badge = document.createElement('div');
      badge.className = 'tech-error-badge';
      badge.textContent = '⚠ Техническая ошибка';
      badge.style.color = '#e53935';
      badge.style.fontWeight = 'bold';
      badge.style.fontSize = '12px';
      badge.style.marginBottom = '4px';
      container.insertBefore(badge, container.firstChild);
    }
  };

  // Есть ли в диалоге ХОТЯ БЫ ОДНА техническая ошибка — влияет на метку
  // всей сессии в верхней панели (см. шаг 2 ниже).
  const hasAnyTechnicalError = containers.some(isTechnicalErrorText);

  // 1. Верхняя панель: фамилия проверяющего (кликаем первой)
  let surnameBtn = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ].find((b) => b.innerText.trim() === '.Ведерников И. Ю.');
  if (surnameBtn) {
    surnameBtn.click();
    await sleep(50);
  }

  // 2. Верхняя панель: статус всей сессии (кликаем вторым)
  // Если в диалоге встретилась тех. ошибка — ставим "Тех. ошибка" вместо
  // "Верно" на уровне всей сессии.
  const topLabelsButtons = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ];
  const topStatusLabel = hasAnyTechnicalError ? 'Тех. ошибка' : 'Верно';
  let topBtn = topLabelsButtons.find((b) => b.innerText.trim() === topStatusLabel);
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

    // Красная подсветка тех. ошибки + клик по кнопке "Ошибка" в метках
    // этого сообщения — независимо от того, размечается ли оно "Верно"
    // (обычно оно как раз пропускается через getSkipReason).
    if (isTechnicalErrorText(container)) {
      highlightTechnicalError(container);
      const errBtn = getErrorButtonInContainer(container);
      if (errBtn) {
        errBtn.click();
        await sleep(50);
      }
    }

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
