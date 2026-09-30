/**
 * Bookmarklet для быстрой разметки диалогов бота в JCP меткой "Верно"
 * + ВИЗУАЛЬНАЯ ПОДСВЕТКА сообщений, которые были размечены автоматически,
 *   чтобы разметчику было легко визуально найти их и перепроверить глазами.
 *
 * Что делает:
 * 1. Ставит "Фамилию И.О" проверяющего и метку "Верно" в верхней панели
 *    диалога (сначала фамилия, затем "Верно" — порядок кликов важен, см.
 *    шаг 1 ниже).
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
 *     номеру 8-800-250-57-57."). Проверяется по тексту, а не по классу/
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
 * verno-marking-bookmarklet-v8.11.min.js.
 *
 * ВАЖНО: скрипт печатает в консоль строку "verno-marking-bookmarklet v8.11
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
 * ДОБАВЛЕНО В v8.11:
 * Подсказки тематик для комментария. Рядом с кнопкой "Добавить комментарий"
 * в каждом сообщении появляется мини-поле поиска (список TOPICS, ~300 тем
 * из xlsx, поиск СТРОГО по началу строки — и по названию стейта, и по
 * русскому описанию). При выборе темы скрипт сам кликает "Добавить
 * комментарий", дожидается модалки и React-безопасно подставляет точное
 * название стейта в textarea — без единого шанса опечататься. По
 * умолчанию (AUTO_SAVE_COMMENT = false) сохранение остаётся за человеком —
 * финальный клик "Сохранить" в открывшейся модалке. Поставьте
 * AUTO_SAVE_COMMENT = true, если нужна полная автоматизация без этого клика.
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
  console.log('verno-marking-bookmarklet v8.11 запущен');
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

  // ОТКЛЮЧЕНО ПО ПРОСЬБЕ: OPERATOR_PATTERNS/isPureOperatorRequest покрывают
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


  // ============================================================
  // ПОДСКАЗКИ ТЕМАТИК ДЛЯ КОММЕНТАРИЯ
  // ============================================================
  // Список тематик (стейтов) для быстрой вставки в комментарий, чтобы не
  // ходить каждый раз на холст в Miro копировать точное название. Поиск —
  // строго по началу строки (и по названию стейта, и по русскому описанию).
  // Чтобы обновить список — просто отредактировать массив TOPICS ниже.
  const TOPICS = [
    ['Card','Карта - Уточнение'],
    ['Card/Debit','Дебетова карта - Уточнение'],
    ['Card/Credit','Кредитная карта - Уточнение'],
    ['Card/AskAboutOldOrNew','Карта - Уточнение - Новая - Действующая'],
    ['Card/AskAboutOldOrNew/Current','Карта действующая'],
    ['Card/AskAboutOldOrNew/New','Карта новая'],
    ['GetDebitCards',''],
    ['GetCreditCards',''],
    ['ChooseCard','Выбор карты по которой нужна инфа'],
    ['Card/AskAboutProfit','Прибыль - Уточнение'],
    ['Card/Debit/Info','Дебетовая карта - Действующая - Информация'],
    ['Card/Debit/Info/Terms','Прибыль - Действующая - Тарифы и условия'],
    ['Card/Debit/Info/Balance','Прибыль - Действующая - Баланс'],
    ['Card/Debit/Info/ProfitBonus','Прибыль - Действующая - Оборот по Уб'],
    ['Card/Debit/Info/ProfitFree','Прибыль - Действующая - Оборот для бесплатности'],
    ['Card/Debit/Info/ProfitPercent','Прибыль - Действующая - Сумма начисленных %'],
    ['Card/Debit/Info/ProfitRate','Прибыль - Действующая - Ставка по карте'],
    ['Card/Status','Карта - Готовность карты'],
    ['Card/Unblock','Карта - Разблокировать'],
    ['Card/Block','Карта - Заблокировать'],
    ['Card/Reissue','Карта - Перевыпуск'],
    ['Card/Credit/Info','Кредитная карта - Действующая - Информация по карте'],
    ['Card/Credit/Info/Terms','Кредитная карта - Действующая - Тарифы и условия'],
    ['Card/Credit/Info/Debt','Кредитная карта - Действующая - Информация  по задолженности'],
    ['Card/Credit/Info/FreeTerms','Кредитная карта - Действующая - Оборот для бесплатности'],
    ['Card/PIN','Карта - Пин код'],
    ['Card/PIN/Install','Карта - Пин код - Установить'],
    ['Card/PIN/Change','Карта - Пин код - Сменить'],
    ['Card/PayTag','Стикер - Уточнение'],
    ['Card/DigitalCard','Цифровая карта - Выпустить'],
    ['Activation','Активировать карту - Уточнение'],
    ['Activation/Delivery','Активировать карту - Доставлена курьером'],
    ['Activation/AtWork','Активировать карту - Получена на работе'],
    ['Activation/Office','Активировать карту - Получена в офисе'],
    ['Activation/SMSNotArrive','Активация карты - Не пришло смс для активации'],
    ['Card/ReissueCancel','Карта - Закрыть заявку на перевыпуск'],
    ['SMSNotifications','Вопрос - Сервис уведомлений'],
    ['SMSPrice','Сервис уведомлений - Стоимость'],
    ['SMSOn','Сервис уведомлений - Подключить'],
    ['SMSOff','Сервис уведомлений - Отключить'],
    ['3DSecure','3DSecure - Уточнение'],
    ['TimeAsAGift','Время в подарок - Уточнение'],
    ['LoanOffer','Персональные предложения - Уточнение'],
    ['LoanOffer/Consumer','Персональные предложения - Потреб кредит'],
    ['CreditCard/Request','Персональные предложения - Кредитная карта / Кредитная карта - Новая - Оформить'],
    ['LoanOffer/Consumer/Approved','Персональные предложения - Потреб кредит - Одобренное предложение'],
    ['LoanOffer/Consumer/ Preapproved','Персональные предложения - Потреб кредит - Предодобренное предложение'],
    ['DebitCard','Дебетовая карта - Новая - Уточнение'],
    ['DebitCard/Request','Дебетовая карта - Новая - Оформить'],
    ['DebitCard/AskCardType','Дебетовая карта - Новая - Вид карты'],
    ['DebitCard/AskCardType/Mir','Дебетовая карта - Новая - Мир классическая - Оформить'],
    ['DebitCard/AskCardType/Senior','Дебетовая карта - Новая - Почетный пенсионер - Оформить'],
    ['DebitCard/AskCardType/Other','Дебетовая карта - Новая - Другое - Оформить'],
    ['DebitCard/AskCardType/Profit','Дебетовая карта - Новая - Прибыль - Оформить'],
    ['DebitCard/AskCardType/Profit/Office','Дебетовая карта - Новая - Прибыль - Оформить в офисе'],
    ['DebitCard/AskCardType/Profit/Delivery','Дебетовая карта - Новая - Прибыль - Оформить через курьера'],
    ['DebitCard/Conditions','Дебетовая карта - Новая - Условия'],
    ['DebitCard/Conditions/Individual','Дебетовая карта - Новая - Условия - Физ лицо'],
    ['DebitCard/Conditions/ Individual/Profit','Дебетовая карта - Новая - Условия - Прибыль'],
    ['DebitCard/Conditions/Individual/Mir','Дебетовая карта - Новая - Условия - Мир'],
    ['DebitCard/Conditions/Individual/Other','Дебетовая карта - Новая - Условия - Другое'],
    ['DebitCard/Conditions/Legal','Дебетовая карта - Новая - Условия - Юрик'],
    ['DebitCard/Cancel','Дебетовая карта - Выпуск карты - Закрыть заявку'],
    ['CreditCard','Кредитная карта - Новая - Уточнение'],
    ['CreditCard/Conditions','Кредитная карта - Новая - Условия'],
    ['CreditCard/AskCardType','Кредитная карта - Новая - Вид карты'],
    ['CreditCard/AskCardType/120Days','Кредитная карта - Новая - Условия - 120 дней'],
    ['CreditCard/AskCardType/Cashback','Кредитная карта - Новая - Условия - Карта с кешбэком'],
    ['CreditCard/AskCardType/Other','Кредитная карта - Новая - Условия - Другая'],
    ['CreditCard/Offer','Кредитная карта - Предложение по карте'],
    ['CreditCard/GracePeriod','Кредитная карта - Льготный период - Уточнение'],
    ['CreditCard/GracePeriod/Info','Кредитная карта - Льготный период - Срок / Кредитная карта - Льготный период - Операции для льготника'],
    ['CreditCard/GracePeriod/Disagree','Кредитная карта - Льготный период - Несогласие'],
    ['CreditCard/GracePeriod/Conditions','Кредитная карта - Льготный период - Условия'],
    ['CreditCard/GracePeriod/Conditions/120Days','Кредитная карта - Льготный период - Условия - 120 дней'],
    ['CreditCard/GracePeriod/Conditions/Cashback','Кредитная карта - Льготный период - Условия - Карта с кешбэком'],
    ['Insurance','Страхование - Уточнение'],
    ['Insurance/Request','Страхование - Оформить - Уточнение'],
    ['Insurance/Prolongation','Страхование - Продлить - Уточнение'],
    ['Insurance/DocChecking','Страхование - Статус рассмотрения документов'],
    ['Insurance/InsuredEvent','Страхование - Страховой случай - Уточнение'],
    ['Insurance/Return','Страхование - Отменить страховку - Уточнение'],
    ['Insurance/Microloan','Страхование - МКК'],
    ['Insurance/Info','Страхование - Действующий - Информация'],
    ['Insurance/Request/Mortgage','Страхование - Оформить - Ипотека'],
    ['Insurance/Request/CarLoan','Страхование - Оформить - Автокредит'],
    ['Insurance/Request/CreditCard','Страхование - Оформить - Кредитная карта'],
    ['Insurance/Request/Other','Страхование - Оформить - Другое'],
    ['Insurance/Request/VZR','Страхование - Оформить - ВЗР'],
    ['Insurance/Prolongation/Mortgage','Страхование - Продлить - Ипотека'],
    ['Insurance/Prolongation/CarLoan','Страхование - Продлить - Автокредит'],
    ['Insurance/Return/CreditCard','Страхование - Отменить страховку - Кредитная карта'],
    ['Insurance/Return/Mortgage','Страхование - Отменить страховку - Ипотека - Уточнение'],
    ['Insurance/Return/CarLoan','Страхование - Отменить страховку - Автокредит - Уточнение'],
    ['Insurance/Return/ConsumerLoan','Страхование - Отменить страховку - Потреб кредит'],
    ['Insurance/Return/POS','Страхование - Отменить страховку - Пос кредит'],
    ['Insurance/Return/CarLoan/Osago','Страхование - Отменить страховку - Автокредит - Осаго'],
    ['Insurance/Return/CarLoan/Casko','Страхование - Отменить страховку - Автокредит - Каско'],
    ['Insurance/Return/CarLoan/Additional','Страхование - Отменить страховку - Автокредит - Партнеры'],
    ['Insurance/Return/Mortgage/Estate','Страхование - Отменить страховку - Ипотека - Недвижимость'],
    ['Insurance/Return/Mortgage/Life','Страхование - Отменить страховку - Ипотека - Жизнь и здоровье'],
    ['Insurance/Return/Mortgage/Title','Страхование - Отменить страховку - Ипотека - Титул'],
    ['Insurance/Return/Mortgage/Box','Страхование - Отменить страховку - Ипотека - Коробочное страхование'],
    ['Insurance/InsuredEvent/CreditCard','Страхование - Страховой случай - Кредитная карта'],
    ['Insurance/InsuredEvent/Loan','Страхование - Страховой случай - Кредит'],
    ['Password','Пароль - Уточнение'],
    ['MobileProblem/Registration/Password','Пароль - Получить - Мобильное приложение'],
    ['DBONavigation/Settings/PasswordChange','Пароль - Сменить пароль - Мобильное приложение'],
    ['DBONavigation/ManageCards/ChangePIN','Пароль - Сменить пароль - Карта'],
    ['Microloan','МКК - Уточнение'],
    ['Microloan/Offer','МКК - Оформить'],
    ['Microloan/Offer/Yes','МКК - Оформить - Есть заем'],
    ['Microloan/Offer/No','МКК - Оформить - Нет займа'],
    ['Microloan/Active','МКК - Действующий - Уточнение'],
    ['Microloan/Check/Status','МКК - Решение по заявке'],
    ['Microloan/Check/Close','МКК - Закрыть заявку'],
    ['Microloan/Insurance/Microloan','МКК - Страхование займа'],
    ['Microloan/Active/Payments','МКК - Действующий - Платеж - Уточнение'],
    ['Microloan/Active/Payments/SumDateInfo','МКК - Действующий - Платеж - Сумма и дата платежа'],
    ['Microloan/Active/Payments/ChangePaymentDate','МКК - Действующий - Платеж - Изменить дату или сумму платежа'],
    ['Microloan/Active/Payments/PayMicroloan','МКК - Действующий - Досрочное погашение'],
    ['Microloan/Active/Payments/Arrest','МКК - Действующий - Оплата при аресте'],
    ['Microloan/Active/Payments/Restructuring/Request/Microloan','МКК - Действующий - Кредитные каникулы'],
    ['Microloan/Active/Payments/Requisites','МКК - Действующий - Платеж - Реквизиты'],
    ['Microloan/Active/Payments/RepaymentMethods','МКК - Действующий - Способы погашения'],
    ['DebtOverDue/DebtOverDue/Collection','МКК - Действующий - Платеж - Просрочка'],
    ['Microloan/Active/PersonalAccount','МКК - Личный кабинет - Уточнение'],
    ['Microloan/Active/PersonalAccount/Registration','МКК - Личный кабинет - Регистрация'],
    ['Microloan/Active/PersonalAccount/Problem','МКК - Личный кабинет - Не работает'],
    ['Microloan/Active/PersonalAccount/Incorrect','МКК - Личный кабинет - Некорректные данные'],
    ['Microloan/Active/PersonalAccount/PasswordProblem','МКК - Личный кабинет - Проблема восстановление пароля'],
    ['Microloan/Active/Documents','МКК - Действующий - Получить документы'],
    ['Microloan/Active/Other','МКК - Действующий - Другие вопросы'],
    ['Microloan/Check','МКК - Заявка - Уточнение'],
    ['Payment','Платеж - Уточнение'],
    ['Payment/Cancel','Платеж - Отменить - Уточнение'],
    ['MoneyTransfer/Revoke (Transfer/Revoke)','Платеж - Отменить - Перевод'],
    ['MoneyTransfer/Revoke','Платеж - Возврат покупки'],
    ['Comission/Disagree','Платеж - Отменить комиссии / Комиссия - Несогласие'],
    ['Subscription/TurnOff','Платеж - Отключение подписок / Подписки - Отключить'],
    ['Payment/Loan','Платеж - Кредит - Уточнение'],
    ['Payment/Loan/SumDateInfo','Платеж - Кредит - Сумма и дата платежа'],
    ['Payment/Loan/Status','Платеж - Кредит - Когда спишется платеж'],
    ['Payment/Loan/Change','Платеж - Кредит - Изменить или пропустить платеж - Уточнение'],
    ['Payment/Loan/TopUp','Платеж - Кредит - Внести'],
    ['Payment/Loan/Change/Loan','Платеж - Кредит - Изменить или пропустить платеж - Кредит'],
    ['Payment/QR','Платеж - QR код - Уточнение'],
    ['Payment/QR/Pay','Платеж - QR код - Как оплатить'],
    ['Payment/QR/Problem','Платеж - QR код - Проблема при оплате'],
    ['UralsibBonus','Уралсиб бонус - Уточнение'],
    ['UralsibBonus/Categories','Уралсиб бонус - Категории - Уточнение'],
    ['UralsibBonus/Categories/Choose','Уралсиб бонус - Категории - Как выбрать'],
    ['UralsibBonus/Categories/Check','Уралсиб бонус - Категории - Как проверить выбранные категории'],
    ['UralsibBonus/Instructions','Уралсиб бонус - Обмен бонусов - Уточнение'],
    ['UralsibBonus/Instructions/Compensation','Уралсиб бонус - Обмен бонусов - Компенсация покупок'],
    ['UralsibBonus/Instructions/Trips','Уралсиб бонус - Обмен бонусов - Путешествия'],
    ['UralsibBonus/Instructions/RZD','Уралсиб бонус - Обмен бонусов - РЖД Бонус'],
    ['UralsibBonus/Question','Уралсиб бонус - Информация по бонусам - Уточнение'],
    ['UralsibBonus/Balance','Уралсиб бонус - Информация по бонусам - Баланс'],
    ['UralsibBonus/History','Уралсиб бонус - Информация по бонусам - История'],
    ['UralsibBonus/Question/Period','Уралсиб бонус - Информация по бонусам - Сроки зачисления'],
    ['UralsibBonus/Question/Expiration','Уралсиб бонус - Информация по бонусам - Сроки использования'],
    ['UralsibBonus/Question/NotArrive','Уралсиб бонус - Информация по бонусам - Не зачислены бонусы'],
    ['UralsibBonus/Problem','Уралсиб бонус - Проблемы'],
    ['UralsibBonus/Participate','Уралсиб бонус - Подключение'],
    ['Refinancing','Рефинансирование - Уточнение'],
    ['Refinancing/Request','Рефинансирование - Оформить - Уточнение'],
    ['Refinancing/Request/Mortgage','Рефинансирование - Оформить - Ипотека'],
    ['Refinancing/Request/ConsumerLoan','Рефинансирование - Оформить - Потреб'],
    ['Refinancing/Request/CarLoan','Рефинансирование - Оформить - Автокредит'],
    ['Refinancing/Request/CreditCard','Рефинансирование - Оформить - Кредитная карта'],
    ['Limit','Лимиты - Уточнение'],
    ['Limit/WithdrawCash','Лимиты - Снятие наличных'],
    ['MoneyTransfer/Requisites/Limits','Лимиты - Переводы'],
    ['Limit/CreditCard','Лимиты - Кредитная карта - Уточнение'],
    ['Limit/CreditCard/Increase','Лимиты - Кредитная карта - Увеличить лимит'],
    ['Limit/CreditCard/Decrease','Лимиты - Кредитная карта - Уменьшить Лимит'],
    ['Limit/CreditCard/Check','Лимиты - Кредитная карта - Посмотреть Лимит'],
    ['Limit/CreditCard/Zero','Лимиты - Кредитная карта - Отсутствует лимит - Уточнение'],
    ['Limit/CreditCard/Zero/New','Лимиты - Кредитная карта - Отсутствует лимит - Новая карта - Уточнение'],
    ['Limit/CreditCard/Zero/Old','Лимиты - Кредитная карта - Отсутствует лимит - Действующая карта'],
    ['Limit/CreditCard/Zero/New/Other','Лимиты - Кредитная карта - Отсутствует лимит - Новая карта - Лимит не начислен'],
    ['CardDelivery','Доставка карт - Уточнение'],
    ['CardDelivery/Status','Доставка карт - Статус'],
    ['CardDelivery/ReasonForRefusal','Доставка карт - Причина отмены'],
    ['CardDelivery/DeliveryCities','Доставка карт - Города доставки'],
    ['CardDelivery/NoDeliveryCity','Доставка карт - Нет моего города'],
    ['CardDelivery/CancelDelivery','Доставка карт - Отменить доставку'],
    ['CardDelivery/Courier','Доставка карт - Вопрос по курьерской службе - Уточнение'],
    ['CardDelivery/Change','Доставка карт - Изменить дату или способ получения - Уточнение'],
    ['CardDelivery/Courier/ContactTheCourier','Доставка карт - Вопрос по курьерской службе - Связаться с курьером'],
    ['CardDelivery/Courier/Claim','Доставка карт - Вопрос по курьерской службе - Жалоба на курьера'],
    ['CardDelivery/Courier/Verificftion','Доставка карт - Вопрос по курьерской службе - Проверка курьерской службы'],
    ['CardDelivery/Change/ReceiveCard','Доставка карт - Изменить способ получения карты'],
    ['CardDelivery/Change/Address','Доставка карт - Изменить адрес или дату получения карты'],
    ['Application','Заявка - Уточнение'],
    ['Application/Submit','Заявка - Оформить - Уточнение'],
    ['Application/Status','Заявка - Статус - Уточнение'],
    ['Application/Cancel','Заявка - Отменить - Уточнение'],
    ['Code','Код - Уточнение'],
    ['DBONavigation/Setting/PIN','Пин код в ДБО - Уточнение'],
    ['Code/NotArrive','Проблема - Не пришел код'],
    ['PINcode','Пин код - Уточнение'],
    ['CloseCard','Закрыть карту - Уточнение'],
    ['CloseCard/DebitCard','Закрыть карту - Дебетовая'],
    ['CloseCard/CreditCard','Закрыть карту - Кредитная'],
    ['PaymentSchedule','График платежей - Уточнение'],
    ['PaymentSchedule/Download','График платежей - Скачать - Уточнение'],
    ['PaymentSchedule/Download/Loan','График платежей - Скачать - Кредит'],
    ['PaymentSchedule/NotUpdated','График платежей - Не обновился - Уточнение'],
    ['PaymentSchedule/NotUpdated/Loan','График платежей - Не обновился - Кредит'],
    ['PhoneCC','Вопрос - Номер горячей линии'],
    ['CallBack','Вопрос - Перезвонить клиенту'],
    ['Banner','Вопрос - Рекламный баннер'],
    ['NumberChange','Вопрос - Изменить номер телефона'],
    ['CallFromTheBank','Мне звонили из банка - Уточнение'],
    ['CallFromTheBank/Other','Мне звонили из банка - Другое'],
    ['Contract','Договор - Уточнение'],
    ['Contract/Receive','Договор - Получить - Уточнение'],
    ['Contract/Receive/CreditCard','Договор - Получить - Кредитная карта'],
    ['Contract/Receive/Pos','Договор - Получить - Пос кредит'],
    ['Contract/Receive/MKK','Договор - Получить - МКК'],
    ['Contract/Receive/Debet','Договор - Получить - Дебетовая карта / Вклад / Счет'],
    ['Contract/Receive/Other','Договор - Получить - Ипотека / Потреб / Автокредит'],
    ['Close','Закрытие - Уточнение'],
    ['Close/Status','Продукт - Статус закрытия - Уточнение'],
    ['Close/Status/CreditCard','Кредитная карта - Статус закрытия'],
    ['Close/Status/DebitCard','Дебетовая карта - Статус закрытия'],
    ['Close/Status/Account','Счет - Статус закрытия'],
    ['Close/Status/Deposit','Вклад - Статус закрытия'],
    ['Close/Status/Loan','Кредит - Статус закрытия'],
    ['Restructuring','Кредитные каникулы - Уточнение'],
    ['Restructuring/Request','Кредитные каникулы - Оформить - Уточнение'],
    ['Restructuring/Request/Loan','Кредитные каникулы - Оформить - Кредит'],
    ['Restructuring/Request/Microloan','Кредитные каникулы - Оформить - МКК'],
    ['Restructuring/Status','Кредитные каникулы - Узнать статус'],
    ['PaidServicesDisable','Платные услуги - Отключить - Уточнение'],
    ['Percent','Проценты - Уточнение'],
    ['Percent/Disagree','Проценты - Несогласие'],
    ['Amount','Сумма - Уточнение'],
    ['Amount/Other','Сумма - Другое'],
    ['Return','Возврат - Уточнение'],
    ['Comission','Комиссия - Уточнение'],
    ['Comission/Withdraw','Комиссия - За снятие - Уточнение'],
    ['Comission/Withdraw/CreditCard','Комиссия - За снятие - Кредитная карта - Уточнение'],
    ['Comission/Withdraw/DebitCard','Комиссия - За снятие - Дебетовая карта'],
    ['CashOrder/Conditions','Комиссия - За снятие - Счет'],
    ['Comission/Withdraw/CreditCard/Day120','Комиссия - За снятие - Кредитная карта - 120 дней'],
    ['Comission/Withdraw/CreditCard/Cashback','Комиссия - За снятие - Кредитная карта - Карта с кешбэком'],
    ['Comission/Transfer','Комиссия - Перевод - Уточнение'],
    ['Comission/Transfer/DebitCard','Комиссия - Перевод - Дебетовая карта'],
    ['Comission/Service','Комиссия - Обслуживание - Уточнение'],
    ['Comission/Service/Card','Комиссия - Обслуживание - Карта - Уточнение'],
    ['Comission/Service/CreditCard','Комиссия - Обслуживание - Кредитная карта'],
    ['Comission/Service/DebitCardard','Комиссия - Обслуживание - Дебетовая карта'],
    ['Comission/Replenish','Комиссия - За пополнение'],
    ['Subscription','Подписки - Уточнение'],
    ['Subscription/Status','Подписки - Проверить наличие'],
    ['Subscription/TurnOn','Подписки - Подключить'],
    ['UpdatePassportData','Паспорт - Обновить'],
    ['Unblock','Разблокировать - Уточнение'],
    ['Block','Заблокировать - Уточнение'],
    ['Debt','Задолженность - Уточнение'],
    ['DebtOverDue','Просрочка - Уточнение'],
    ['DebtOverDue/Collection','Просрочка - Урегулировать'],
    ['DebtOverDue/Have','Просрочка - Проверить наличие'],
    ['Money','Деньги - Уточнение'],
    ['Money/NotArrive','Деньги - Не пришли'],
    ['Money/WrittenOff','Деньги - Списались'],
    ['Broker','Брокер - Уточнение'],
    ['Broker/Request','Брокер - Открыть счет'],
    ['Broker/Current','Брокер - Вопрос по действующему'],
    ['Broker/Whats','Брокер - Не открывал счет'],
    ['Broker/Cancel','Брокер - Закрыть заявку'],
    ['Trouble','Проблема - Уточнение'],
    ['Trouble/Loan','Проблема - Не могу оформить кредит'],
    ['Trouble/Button','Проблема - Не работает кнопка'],
    ['Promo','Акции - Уточнение'],
    ['Promo/Current','Акции - Актуальные'],
    ['Promo/Conditions','Акции - Условия'],
    ['Promo/Participated','Акции - Не зачислены бонусы'],
    ['ServiceDesk','Перевод на 5555'],
    ['Requisites','Реквизиты - Уточнение'],
    ['Requisites/Bank','Реквизиты - Банка'],
    ['Requisites/CVV','Реквизиты - CVV'],
    ['StopList','Карта - Стоп лист'],
    ['MobileUpdate','Приложение - Обновить'],
    ['Documents','Документы - Уточнение'],
    ['Documents/Status','Документы - Статус - Уточнение'],
    ['Documents/Status/Card','Документы - Статус - Разблокировка карты'],
    ['Documents/Get','Документы - Получить - Уточнение'],
    ['Documents/Send','Документы - Отправить - Уточнение'],
    ['Documents/Send/Confirm','Документы - Отправить - Подтверждение дохода'],
    ['Documents/Send/VehiclePassport','Документы - Отправить - ПТС/СТС'],
    ['Documents/Send/UnblockCard','Документы - Отправить - Разблокировка карты'],
    ['Login/Clarify','Логин - Уточнение'],
    ['Login/Change','Логин - Изменить'],
    ['Login/Get/Clarify','Логин - Получить'],
    ['SupportRequest','Заявка в СД'],
    ['Utilities','ЖКУ - Уточнение'],
    ['Utilities/Bonus','ЖКУ - Участвую в акции']
  ];

  // Если true — при выборе темы комментарий сразу сохраняется (клик по
  // "Сохранить" происходит автоматически, без участия человека). По
  // умолчанию false: комментарий подставляется в открывшееся окно, но
  // сохранение остаётся за человеком — финальная проверка перед
  // необратимым действием. Поменяйте на true, если хотите полную
  // автоматизацию без единого лишнего клика.
  const AUTO_SAVE_COMMENT = false;

  // Устанавливает значение textarea так, чтобы React увидел изменение
  // (простое textarea.value = ... не сработает с controlled-компонентом).
  const setReactTextareaValue = (textarea, value) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    nativeSetter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Открывает модалку "Комментарий" для данного сообщения, вставляет
  // название темы и (если включено) сразу сохраняет.
  const applyTopicToComment = async (commentBtn, stateName) => {
    commentBtn.click();

    let textarea = null;
    for (let i = 0; i < 20 && !textarea; i++) {
      textarea = document.querySelector('.modal.show textarea.form-control');
      if (!textarea) await sleep(50);
    }
    if (!textarea) {
      console.warn('Не удалось найти поле комментария для темы: ' + stateName);
      return;
    }

    setReactTextareaValue(textarea, stateName);

    if (AUTO_SAVE_COMMENT) {
      await sleep(50);
      const saveBtn = document.querySelector('.modal.show button[type="submit"]');
      if (saveBtn) saveBtn.click();
    }
  };

  // Прикрепляет мини-поле с подсказками тематик рядом с кнопкой
  // "Добавить комментарий" внутри одного сообщения.
  const attachTopicAutocomplete = (container) => {
    const commentBtn = container.querySelector('button[data-test-id="qaTaskComment"]');
    if (!commentBtn || commentBtn.dataset.topicAutocompleteAttached) return;
    commentBtn.dataset.topicAutocompleteAttached = '1';

    const wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:inline-block;margin-left:8px;vertical-align:middle;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Тема...';
    input.style.cssText =
      'font-size:12px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;width:150px;';

    const list = document.createElement('div');
    list.style.cssText =
      'position:absolute;top:100%;left:0;z-index:9999;background:#fff;border:1px solid #ccc;' +
      'border-radius:4px;max-height:240px;overflow-y:auto;display:none;min-width:280px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.18);';

    const renderList = (query) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        list.style.display = 'none';
        list.innerHTML = '';
        return;
      }
      const matches = TOPICS.filter(
        ([state, desc]) =>
          state.toLowerCase().startsWith(q) || (desc && desc.toLowerCase().startsWith(q))
      ).slice(0, 25);

      if (!matches.length) {
        list.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      list.innerHTML = '';
      matches.forEach(([state, desc]) => {
        const item = document.createElement('div');
        item.style.cssText =
          'padding:6px 8px;cursor:pointer;font-size:12px;border-bottom:1px solid #eee;';
        item.innerHTML =
          '<div style="font-weight:600;color:#222;">' + state + '</div>' +
          (desc ? '<div style="color:#888;margin-top:1px;">' + desc + '</div>' : '');
        item.addEventListener('mouseenter', () => {
          item.style.background = '#f2f6ff';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '';
        });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault(); // чтобы blur инпута не сработал раньше клика
          applyTopicToComment(commentBtn, state);
          input.value = '';
          list.style.display = 'none';
        });
        list.appendChild(item);
      });

      list.style.display = 'block';
    };

    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.style.display = 'none';
      }, 150);
    });

    wrap.appendChild(input);
    wrap.appendChild(list);
    commentBtn.insertAdjacentElement('afterend', wrap);
  };

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

    // Подсказки тематик для комментария — прикрепляем в любом случае,
    // независимо от того, размечается сообщение или пропускается.
    attachTopicAutocomplete(container);

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
