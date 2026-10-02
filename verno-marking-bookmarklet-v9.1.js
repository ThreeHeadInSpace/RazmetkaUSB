/**
 * verno-marking-bookmarklet V9
 *
 * Bookmarklet для быстрой разметки диалогов бота в JCP.
 *
 * ТЕКУЩАЯ ЛОГИКА
 *
 * 1. Верхняя панель диалога:
 *    - сначала нажимает метку проверяющего ".Ведерников И. Ю.";
 *    - затем ставит "Верно";
 *    - если в диалоге найден хотя бы один фиксированный текст технической
 *      ошибки, вместо "Верно" на уровне всей сессии ставит "Тех. ошибка".
 *
 * 2. Сообщения, которые скрипт РАЗМЕЧАЕТ:
 *    - все сообщения, для которых getSkipReason возвращает null;
 *    - каждому такому сообщению нажимает кнопку "Верно";
 *    - добавляет оранжевую рамку, фон и бейдж
 *      "● Размечено автоматически — проверьте".
 *
 * 3. Сообщения, которые скрипт ПРОПУСКАЕТ и НЕ размечает "Верно":
 *    - голое обращение к человеку: "оператор", "специалист", "сотрудник",
 *      "консультант", "менеджер", "человек" и их словоформы; допускается
 *      отдельное слово "пожалуйста";
 *    - фиксированный ответ бота после FileEvent:
 *      "Сейчас вопросы по файлу не входят в мои задачи.
 *       Давайте позовем специалиста.";
 *    - class И state одновременно содержат "clarity";
 *    - безопасная пара:
 *        class содержит "generalstates/clarity"
 *        И state содержит "generalstates/transfertooperator";
 *    - class содержит "selling" или "/handlers/timeouthandler";
 *    - state содержит "anyerror", "fileevent", "timeouthandler"
 *      или "limithandler";
 *    - текст клиента дословно совпадает с кнопкой быстрого ответа
 *      из предыдущего сообщения бота;
 *    - чистое приветствие, прощание или благодарность;
 *    - фиксированный текст технической ошибки в ответе бота;
 *    - class строго равен "/donthavequestions" и текст клиента означает,
 *      что вопросов больше нет.
 *
 * 4. Приоритет noMatch:
 *    - noMatch проверяется только в class;
 *    - сообщение с noMatch размечается "Верно", даже если ниже подошло бы
 *      другое правило пропуска;
 *    - исключения выше noMatch: голое обращение к человеку и фиксированный
 *      FileEvent-followup, они всё равно пропускаются.
 *
 * 5. TransferToOperator:
 *    - сам по себе НЕ является причиной пропуска;
 *    - безопасная пара Clarity + TransferToOperator пропускается;
 *    - остальные независимые правила (кнопка, приветствие и т.д.) продолжают
 *      проверяться и тоже могут привести к пропуску.
 *
 * 6. Техническая ошибка:
 *    - сообщение подсвечивается красным;
 *    - в самом сообщении нажимается "Ошибка";
 *    - наличие хотя бы одной такой ошибки переводит метку всей сессии
 *      в "Тех. ошибка".
 *
 * 7. Подсказки тематик для комментария:
 *    - рядом с "Добавить комментарий" добавляется поле "Тема...";
 *    - поиск идёт по любому вхождению в названии стейта или описании;
 *    - при пустом запросе показывается весь список TOPICS;
 *    - можно выбрать тему из списка или вставить введённый текст,
 *      даже если его нет в TOPICS;
 *    - тема подставляется в модалку комментария, но автоматически
 *      НЕ сохраняется.
 *
 * 8. Диагностика:
 *    - версия и запуск пишутся в консоль;
 *    - для каждого сообщения выводятся class, state, clientText,
 *      willSkip и skipReason;
 *    - в конце выводится количество размеченных и пропущенных сообщений.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 * В URL закладки вставляется минифицированный файл
 * verno-marking-bookmarklet-V9.min.js одной строкой, начиная с "javascript:".
 *
 * ГДЕ МЕНЯТЬ ПРАВИЛА:
 * - безопасные классы -> SKIP_CLASSES;
 * - безопасные стейты -> SKIP_STATES;
 * - безопасные пары class/state -> SKIP_CLASS_STATE_PAIRS;
 * - приветствия -> GREETING_PATTERNS;
 * - прощания -> GOODBYE_PATTERNS;
 * - благодарности -> THANKS_PATTERNS;
 * - фразы "вопросов больше нет" -> NO_MORE_QUESTIONS_PATTERNS;
 * - тексты технической ошибки -> TECHNICAL_ERROR_TEXTS;
 * - список тематик -> TOPICS.
 */

javascript:(async () => {
  const SCRIPT_VERSION = 'V9.1';
  console.log('verno-marking-bookmarklet ' + SCRIPT_VERSION + ' запущен');
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

  // Точная безопасная связка Clarity + TransferToOperator.
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
    /^спасибо(?:\s+вам)?(?:\s+(?:большое|огромное|большущее))?$/,
    /^(?:большое|огромное)\s+спасибо(?:\s+вам)?$/,
    /^благодарю(?:\s+вас)?$/,
  ];

  const isPureThanks = (text) => {
    const normalized = normalizeClientText(text);
    return THANKS_PATTERNS.some((pattern) => pattern.test(normalized));
  };

  const isThanksMessage = (container) => isPureThanks(getClientRawText(container));

  // --- Голое обращение к оператору / человеку ---
  const HUMAN_ROLE =
    '(?:оператор[а-яё]*|специалист[а-яё]*|сотрудник[а-яё]*|консультант[а-яё]*|менеджер[а-яё]*|(?:жив[а-яё]+\\s+)?человек[а-яё]*)';

  // Нормализация текста клиента для проверки голого обращения.
  const normalizeForOperatorCheck = (container) =>
    normalizeClientText(getClientRawText(container))
      .replace(/(?:^|\s)пожалуйста(?:\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Проверяется раньше noMatch: голое обращение пропускается всегда,
  // независимо от класса/стейта.
  const BARE_OPERATOR_PATTERN = new RegExp('^' + HUMAN_ROLE + '$');

  const isBareOperatorWord = (container) => {
    const normalized = normalizeForOperatorCheck(container);
    if (!normalized) return false;
    return BARE_OPERATOR_PATTERN.test(normalized);
  };

  // --- Правило A1 (тоже проверяется раньше noMatch): фиксированный ответ
  // бота после FileEvent ---
  // После присланного файла, если следующее сообщение клиента не подошло ни
  // под один паттерн (часто noMatch), бот ВСЕГДА отвечает одной и той же
  // фразой и переводит на специалиста — другого ответа здесь физически быть
  // не может. Проверяем по тексту БОТА (не клиента), независимо от класса/
  // стейта, включая noMatch.
  // Проверяем ТОЛЬКО инвариантную часть — первые два предложения ("Сейчас
  // вопросы по файлу не входят в мои задачи. Давайте позовем специалиста.").
  // Хвостовая фраза ("Ожидайте, пожалуйста, ...") — это ОБЩЕЕ сообщение
  // перехода на оператора, которое варьируется независимо (встречались:
  // "...подключения специалиста.", "...перевожу вас на специалиста." и т.п.),
  // поэтому включать его в проверку нельзя — иначе совпадение ломается при
  // любом другом варианте окончания.
  const FILE_EVENT_FOLLOWUP_TEXT = norm(
    'Сейчас вопросы по файлу не входят в мои задачи. Давайте позовем специалиста.'
  );

  const isFileEventFollowupMessage = (container) => {
    const text = getBotText(container);
    if (!text) return false;
    return text.includes(FILE_EVENT_FOLLOWUP_TEXT);
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
    /^(?:спасибо\s*)?(?:вопросов\s+(?:больше\s+)?нет|больше\s+вопросов\s+нет|нет\s+(?:больше\s+)?вопросов)$/,
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
    if (isFileEventFollowupMessage(container)) return 'fileEventFollowup';

    // noMatch — приоритет на ручную проверку для всего остального, отменяет
    // всё ниже (но НЕ отменяет правило выше).
    if (hasNoMatch(classAndState)) return null;

    if (isClarityBothClassState(classAndState)) return 'clarityBoth';

    // TransferToOperator сам по себе не блокирует остальные правила.
    if (isClarityTransferToOperatorPair(container)) return 'clarityTransferToOperatorPair';
    if (isSkipByClassOrState(container)) return 'classOrState';
    if (isButtonClickResponse(container, prevContainer)) return 'buttonClick';
    if (isGreetingMessage(container)) return 'greeting';
    if (isGoodbyeMessage(container)) return 'goodbye';
    if (isThanksMessage(container)) return 'thanks';
    if (isTechnicalErrorText(container)) return 'technicalError';
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
  // Поиск идёт по любому вхождению в названии стейта или русском описании.
  // Чтобы обновить список, отредактируйте массив TOPICS ниже.
  const TOPICS = [
    ['3DSecure','3DSecure - Уточнение'],
    ['Activation','Активировать карту - Уточнение'],
    ['Activation/AtWork','Активировать карту - Получена на работе'],
    ['Activation/Delivery','Активировать карту - Доставлена курьером'],
    ['Activation/Office','Активировать карту - Получена в офисе'],
    ['Activation/SMSNotArrive','Активация карты - Не пришло смс для активации'],
    ['Amount','Сумма - Уточнение'],
    ['Amount/Other','Сумма - Другое'],
    ['Application','Заявка - Уточнение'],
    ['Application/Cancel','Заявка - Отменить - Уточнение'],
    ['Application/Status','Заявка - Статус - Уточнение'],
    ['Application/Submit','Заявка - Оформить - Уточнение'],
    ['Banner','Вопрос - Рекламный баннер'],
    ['Block','Заблокировать - Уточнение'],
    ['Broker','Брокер - Уточнение'],
    ['Broker/Cancel','Брокер - Закрыть заявку'],
    ['Broker/Current','Брокер - Вопрос по действующему'],
    ['Broker/Request','Брокер - Открыть счет'],
    ['Broker/Whats','Брокер - Не открывал счет'],
    ['CallBack','Вопрос - Перезвонить клиенту'],
    ['CallFromTheBank','Мне звонили из банка - Уточнение'],
    ['CallFromTheBank/Other','Мне звонили из банка - Другое'],
    ['Card','Карта - Уточнение'],
    ['Card/AskAboutOldOrNew','Карта - Уточнение - Новая - Действующая'],
    ['Card/AskAboutOldOrNew/Current','Карта действующая'],
    ['Card/AskAboutOldOrNew/New','Карта новая'],
    ['Card/AskAboutProfit','Прибыль - Уточнение'],
    ['Card/Block','Карта - Заблокировать'],
    ['Card/Credit','Кредитная карта - Уточнение'],
    ['Card/Credit/Info','Кредитная карта - Действующая - Информация по карте'],
    ['Card/Credit/Info/Debt','Кредитная карта - Действующая - Информация  по задолженности'],
    ['Card/Credit/Info/FreeTerms','Кредитная карта - Действующая - Оборот для бесплатности'],
    ['Card/Credit/Info/Terms','Кредитная карта - Действующая - Тарифы и условия'],
    ['Card/Debit','Дебетова карта - Уточнение'],
    ['Card/Debit/Info','Дебетовая карта - Действующая - Информация'],
    ['Card/Debit/Info/Balance','Прибыль - Действующая - Баланс'],
    ['Card/Debit/Info/ProfitBonus','Прибыль - Действующая - Оборот по Уб'],
    ['Card/Debit/Info/ProfitFree','Прибыль - Действующая - Оборот для бесплатности'],
    ['Card/Debit/Info/ProfitPercent','Прибыль - Действующая - Сумма начисленных %'],
    ['Card/Debit/Info/ProfitRate','Прибыль - Действующая - Ставка по карте'],
    ['Card/Debit/Info/Terms','Прибыль - Действующая - Тарифы и условия'],
    ['Card/DigitalCard','Цифровая карта - Выпустить'],
    ['Card/PayTag','Стикер - Уточнение'],
    ['Card/PIN','Карта - Пин код'],
    ['Card/PIN/Change','Карта - Пин код - Сменить'],
    ['Card/PIN/Install','Карта - Пин код - Установить'],
    ['Card/Reissue','Карта - Перевыпуск'],
    ['Card/ReissueCancel','Карта - Закрыть заявку на перевыпуск'],
    ['Card/Status','Карта - Готовность карты'],
    ['Card/Unblock','Карта - Разблокировать'],
    ['CardDelivery','Доставка карт - Уточнение'],
    ['CardDelivery/CancelDelivery','Доставка карт - Отменить доставку'],
    ['CardDelivery/Change','Доставка карт - Изменить дату или способ получения - Уточнение'],
    ['CardDelivery/Change/Address','Доставка карт - Изменить адрес или дату получения карты'],
    ['CardDelivery/Change/ReceiveCard','Доставка карт - Изменить способ получения карты'],
    ['CardDelivery/Courier','Доставка карт - Вопрос по курьерской службе - Уточнение'],
    ['CardDelivery/Courier/Claim','Доставка карт - Вопрос по курьерской службе - Жалоба на курьера'],
    ['CardDelivery/Courier/ContactTheCourier','Доставка карт - Вопрос по курьерской службе - Связаться с курьером'],
    ['CardDelivery/Courier/Verificftion','Доставка карт - Вопрос по курьерской службе - Проверка курьерской службы'],
    ['CardDelivery/DeliveryCities','Доставка карт - Города доставки'],
    ['CardDelivery/NoDeliveryCity','Доставка карт - Нет моего города'],
    ['CardDelivery/ReasonForRefusal','Доставка карт - Причина отмены'],
    ['CardDelivery/Status','Доставка карт - Статус'],
    ['CashOrder/Conditions','Комиссия - За снятие - Счет'],
    ['ChooseCard','Выбор карты по которой нужна инфа'],
    ['Close','Закрытие - Уточнение'],
    ['Close/Status','Продукт - Статус закрытия - Уточнение'],
    ['Close/Status/Account','Счет - Статус закрытия'],
    ['Close/Status/CreditCard','Кредитная карта - Статус закрытия'],
    ['Close/Status/DebitCard','Дебетовая карта - Статус закрытия'],
    ['Close/Status/Deposit','Вклад - Статус закрытия'],
    ['Close/Status/Loan','Кредит - Статус закрытия'],
    ['CloseCard','Закрыть карту - Уточнение'],
    ['CloseCard/CreditCard','Закрыть карту - Кредитная'],
    ['CloseCard/DebitCard','Закрыть карту - Дебетовая'],
    ['Code','Код - Уточнение'],
    ['Code/NotArrive','Проблема - Не пришел код'],
    ['Comission','Комиссия - Уточнение'],
    ['Comission/Disagree','Платеж - Отменить комиссии / Комиссия - Несогласие'],
    ['Comission/Replenish','Комиссия - За пополнение'],
    ['Comission/Service','Комиссия - Обслуживание - Уточнение'],
    ['Comission/Service/Card','Комиссия - Обслуживание - Карта - Уточнение'],
    ['Comission/Service/CreditCard','Комиссия - Обслуживание - Кредитная карта'],
    ['Comission/Service/DebitCard','Комиссия - Обслуживание - Дебетовая карта'],
    ['Comission/Transfer','Комиссия - Перевод - Уточнение'],
    ['Comission/Transfer/DebitCard','Комиссия - Перевод - Дебетовая карта'],
    ['Comission/Withdraw','Комиссия - За снятие - Уточнение'],
    ['Comission/Withdraw/CreditCard','Комиссия - За снятие - Кредитная карта - Уточнение'],
    ['Comission/Withdraw/CreditCard/Cashback','Комиссия - За снятие - Кредитная карта - Карта с кешбэком'],
    ['Comission/Withdraw/CreditCard/Day120','Комиссия - За снятие - Кредитная карта - 120 дней'],
    ['Comission/Withdraw/DebitCard','Комиссия - За снятие - Дебетовая карта'],
    ['Contract','Договор - Уточнение'],
    ['Contract/Receive','Договор - Получить - Уточнение'],
    ['Contract/Receive/CreditCard','Договор - Получить - Кредитная карта'],
    ['Contract/Receive/Debet','Договор - Получить - Дебетовая карта / Вклад / Счет'],
    ['Contract/Receive/MKK','Договор - Получить - МКК'],
    ['Contract/Receive/Other','Договор - Получить - Ипотека / Потреб / Автокредит'],
    ['Contract/Receive/Pos','Договор - Получить - Пос кредит'],
    ['CreditCard','Кредитная карта - Новая - Уточнение'],
    ['CreditCard/AskCardType','Кредитная карта - Новая - Вид карты'],
    ['CreditCard/AskCardType/120Days','Кредитная карта - Новая - Условия - 120 дней'],
    ['CreditCard/AskCardType/Cashback','Кредитная карта - Новая - Условия - Карта с кешбэком'],
    ['CreditCard/AskCardType/Other','Кредитная карта - Новая - Условия - Другая'],
    ['CreditCard/Conditions','Кредитная карта - Новая - Условия'],
    ['CreditCard/GracePeriod','Кредитная карта - Льготный период - Уточнение'],
    ['CreditCard/GracePeriod/Conditions','Кредитная карта - Льготный период - Условия'],
    ['CreditCard/GracePeriod/Conditions/120Days','Кредитная карта - Льготный период - Условия - 120 дней'],
    ['CreditCard/GracePeriod/Conditions/Cashback','Кредитная карта - Льготный период - Условия - Карта с кешбэком'],
    ['CreditCard/GracePeriod/Disagree','Кредитная карта - Льготный период - Несогласие'],
    ['CreditCard/GracePeriod/Info','Кредитная карта - Льготный период - Срок / Кредитная карта - Льготный период - Операции для льготника'],
    ['CreditCard/Offer','Кредитная карта - Предложение по карте'],
    ['CreditCard/Request','Персональные предложения - Кредитная карта / Кредитная карта - Новая - Оформить'],
    ['DBONavigation/ManageCards/ChangePIN','Пароль - Сменить пароль - Карта'],
    ['DBONavigation/Setting/PIN','Пин код в ДБО - Уточнение'],
    ['DBONavigation/Settings/PasswordChange','Пароль - Сменить пароль - Мобильное приложение'],
    ['DebitCard','Дебетовая карта - Новая - Уточнение'],
    ['DebitCard/AskCardType','Дебетовая карта - Новая - Вид карты'],
    ['DebitCard/AskCardType/Mir','Дебетовая карта - Новая - Мир классическая - Оформить'],
    ['DebitCard/AskCardType/Other','Дебетовая карта - Новая - Другое - Оформить'],
    ['DebitCard/AskCardType/Profit','Дебетовая карта - Новая - Прибыль - Оформить'],
    ['DebitCard/AskCardType/Profit/Delivery','Дебетовая карта - Новая - Прибыль - Оформить через курьера'],
    ['DebitCard/AskCardType/Profit/Office','Дебетовая карта - Новая - Прибыль - Оформить в офисе'],
    ['DebitCard/AskCardType/Senior','Дебетовая карта - Новая - Почетный пенсионер - Оформить'],
    ['DebitCard/Cancel','Дебетовая карта - Выпуск карты - Закрыть заявку'],
    ['DebitCard/Conditions','Дебетовая карта - Новая - Условия'],
    ['DebitCard/Conditions/ Individual/Profit','Дебетовая карта - Новая - Условия - Прибыль'],
    ['DebitCard/Conditions/Individual','Дебетовая карта - Новая - Условия - Физ лицо'],
    ['DebitCard/Conditions/Individual/Mir','Дебетовая карта - Новая - Условия - Мир'],
    ['DebitCard/Conditions/Individual/Other','Дебетовая карта - Новая - Условия - Другое'],
    ['DebitCard/Conditions/Legal','Дебетовая карта - Новая - Условия - Юрик'],
    ['DebitCard/Request','Дебетовая карта - Новая - Оформить'],
    ['Debt','Задолженность - Уточнение'],
    ['DebtOverDue','Просрочка - Уточнение'],
    ['DebtOverDue/Collection','Просрочка - Урегулировать'],
    ['DebtOverDue/DebtOverDue/Collection','МКК - Действующий - Платеж - Просрочка'],
    ['DebtOverDue/Have','Просрочка - Проверить наличие'],
    ['Documents','Документы - Уточнение'],
    ['Documents/Get','Документы - Получить - Уточнение'],
    ['Documents/Send','Документы - Отправить - Уточнение'],
    ['Documents/Send/Confirm','Документы - Отправить - Подтверждение дохода'],
    ['Documents/Send/UnblockCard','Документы - Отправить - Разблокировка карты'],
    ['Documents/Send/VehiclePassport','Документы - Отправить - ПТС/СТС'],
    ['Documents/Status','Документы - Статус - Уточнение'],
    ['Documents/Status/Card','Документы - Статус - Разблокировка карты'],
    ['GetCreditCards',''],
    ['GetDebitCards',''],
    ['Insurance','Страхование - Уточнение'],
    ['Insurance/DocChecking','Страхование - Статус рассмотрения документов'],
    ['Insurance/Info','Страхование - Действующий - Информация'],
    ['Insurance/InsuredEvent','Страхование - Страховой случай - Уточнение'],
    ['Insurance/InsuredEvent/CreditCard','Страхование - Страховой случай - Кредитная карта'],
    ['Insurance/InsuredEvent/Loan','Страхование - Страховой случай - Кредит'],
    ['Insurance/Microloan','Страхование - МКК'],
    ['Insurance/Prolongation','Страхование - Продлить - Уточнение'],
    ['Insurance/Prolongation/CarLoan','Страхование - Продлить - Автокредит'],
    ['Insurance/Prolongation/Mortgage','Страхование - Продлить - Ипотека'],
    ['Insurance/Request','Страхование - Оформить - Уточнение'],
    ['Insurance/Request/CarLoan','Страхование - Оформить - Автокредит'],
    ['Insurance/Request/CreditCard','Страхование - Оформить - Кредитная карта'],
    ['Insurance/Request/Mortgage','Страхование - Оформить - Ипотека'],
    ['Insurance/Request/Other','Страхование - Оформить - Другое'],
    ['Insurance/Request/VZR','Страхование - Оформить - ВЗР'],
    ['Insurance/Return','Страхование - Отменить страховку - Уточнение'],
    ['Insurance/Return/CarLoan','Страхование - Отменить страховку - Автокредит - Уточнение'],
    ['Insurance/Return/CarLoan/Additional','Страхование - Отменить страховку - Автокредит - Партнеры'],
    ['Insurance/Return/CarLoan/Casko','Страхование - Отменить страховку - Автокредит - Каско'],
    ['Insurance/Return/CarLoan/Osago','Страхование - Отменить страховку - Автокредит - Осаго'],
    ['Insurance/Return/ConsumerLoan','Страхование - Отменить страховку - Потреб кредит'],
    ['Insurance/Return/CreditCard','Страхование - Отменить страховку - Кредитная карта'],
    ['Insurance/Return/Mortgage','Страхование - Отменить страховку - Ипотека - Уточнение'],
    ['Insurance/Return/Mortgage/Box','Страхование - Отменить страховку - Ипотека - Коробочное страхование'],
    ['Insurance/Return/Mortgage/Estate','Страхование - Отменить страховку - Ипотека - Недвижимость'],
    ['Insurance/Return/Mortgage/Life','Страхование - Отменить страховку - Ипотека - Жизнь и здоровье'],
    ['Insurance/Return/Mortgage/Title','Страхование - Отменить страховку - Ипотека - Титул'],
    ['Insurance/Return/POS','Страхование - Отменить страховку - Пос кредит'],
    ['Limit','Лимиты - Уточнение'],
    ['Limit/CreditCard','Лимиты - Кредитная карта - Уточнение'],
    ['Limit/CreditCard/Check','Лимиты - Кредитная карта - Посмотреть Лимит'],
    ['Limit/CreditCard/Decrease','Лимиты - Кредитная карта - Уменьшить Лимит'],
    ['Limit/CreditCard/Increase','Лимиты - Кредитная карта - Увеличить лимит'],
    ['Limit/CreditCard/Zero','Лимиты - Кредитная карта - Отсутствует лимит - Уточнение'],
    ['Limit/CreditCard/Zero/New','Лимиты - Кредитная карта - Отсутствует лимит - Новая карта - Уточнение'],
    ['Limit/CreditCard/Zero/New/Other','Лимиты - Кредитная карта - Отсутствует лимит - Новая карта - Лимит не начислен'],
    ['Limit/CreditCard/Zero/Old','Лимиты - Кредитная карта - Отсутствует лимит - Действующая карта'],
    ['Limit/WithdrawCash','Лимиты - Снятие наличных'],
    ['LoanOffer','Персональные предложения - Уточнение'],
    ['LoanOffer/Consumer','Персональные предложения - Потреб кредит'],
    ['LoanOffer/Consumer/ Preapproved','Персональные предложения - Потреб кредит - Предодобренное предложение'],
    ['LoanOffer/Consumer/Approved','Персональные предложения - Потреб кредит - Одобренное предложение'],
    ['Login/Change','Логин - Изменить'],
    ['Login/Clarify','Логин - Уточнение'],
    ['Login/Get/Clarify','Логин - Получить'],
    ['Microloan','МКК - Уточнение'],
    ['Microloan/Active','МКК - Действующий - Уточнение'],
    ['Microloan/Active/Documents','МКК - Действующий - Получить документы'],
    ['Microloan/Active/Other','МКК - Действующий - Другие вопросы'],
    ['Microloan/Active/Payments','МКК - Действующий - Платеж - Уточнение'],
    ['Microloan/Active/Payments/Arrest','МКК - Действующий - Оплата при аресте'],
    ['Microloan/Active/Payments/ChangePaymentDate','МКК - Действующий - Платеж - Изменить дату или сумму платежа'],
    ['Microloan/Active/Payments/PayMicroloan','МКК - Действующий - Досрочное погашение'],
    ['Microloan/Active/Payments/RepaymentMethods','МКК - Действующий - Способы погашения'],
    ['Microloan/Active/Payments/Requisites','МКК - Действующий - Платеж - Реквизиты'],
    ['Microloan/Active/Payments/Restructuring/Request/Microloan','МКК - Действующий - Кредитные каникулы'],
    ['Microloan/Active/Payments/SumDateInfo','МКК - Действующий - Платеж - Сумма и дата платежа'],
    ['Microloan/Active/PersonalAccount','МКК - Личный кабинет - Уточнение'],
    ['Microloan/Active/PersonalAccount/Incorrect','МКК - Личный кабинет - Некорректные данные'],
    ['Microloan/Active/PersonalAccount/PasswordProblem','МКК - Личный кабинет - Проблема восстановление пароля'],
    ['Microloan/Active/PersonalAccount/Problem','МКК - Личный кабинет - Не работает'],
    ['Microloan/Active/PersonalAccount/Registration','МКК - Личный кабинет - Регистрация'],
    ['Microloan/Check','МКК - Заявка - Уточнение'],
    ['Microloan/Check/Close','МКК - Закрыть заявку'],
    ['Microloan/Check/Status','МКК - Решение по заявке'],
    ['Microloan/Insurance/Microloan','МКК - Страхование займа'],
    ['Microloan/Offer','МКК - Оформить'],
    ['Microloan/Offer/No','МКК - Оформить - Нет займа'],
    ['Microloan/Offer/Yes','МКК - Оформить - Есть заем'],
    ['MobileProblem/Registration/Password','Пароль - Получить - Мобильное приложение'],
    ['MobileUpdate','Приложение - Обновить'],
    ['Money','Деньги - Уточнение'],
    ['Money/NotArrive','Деньги - Не пришли'],
    ['Money/WrittenOff','Деньги - Списались'],
    ['MoneyTransfer/Requisites/Limits','Лимиты - Переводы'],
    ['MoneyTransfer/Revoke','Платеж - Возврат покупки'],
    ['MoneyTransfer/Revoke (Transfer/Revoke)','Платеж - Отменить - Перевод'],
    ['NumberChange','Вопрос - Изменить номер телефона'],
    ['PaidServicesDisable','Платные услуги - Отключить - Уточнение'],
    ['Password','Пароль - Уточнение'],
    ['Payment','Платеж - Уточнение'],
    ['Payment/Cancel','Платеж - Отменить - Уточнение'],
    ['Payment/Loan','Платеж - Кредит - Уточнение'],
    ['Payment/Loan/Change','Платеж - Кредит - Изменить или пропустить платеж - Уточнение'],
    ['Payment/Loan/Change/Loan','Платеж - Кредит - Изменить или пропустить платеж - Кредит'],
    ['Payment/Loan/Status','Платеж - Кредит - Когда спишется платеж'],
    ['Payment/Loan/SumDateInfo','Платеж - Кредит - Сумма и дата платежа'],
    ['Payment/Loan/TopUp','Платеж - Кредит - Внести'],
    ['Payment/QR','Платеж - QR код - Уточнение'],
    ['Payment/QR/Pay','Платеж - QR код - Как оплатить'],
    ['Payment/QR/Problem','Платеж - QR код - Проблема при оплате'],
    ['PaymentSchedule','График платежей - Уточнение'],
    ['PaymentSchedule/Download','График платежей - Скачать - Уточнение'],
    ['PaymentSchedule/Download/Loan','График платежей - Скачать - Кредит'],
    ['PaymentSchedule/NotUpdated','График платежей - Не обновился - Уточнение'],
    ['PaymentSchedule/NotUpdated/Loan','График платежей - Не обновился - Кредит'],
    ['Percent','Проценты - Уточнение'],
    ['Percent/Disagree','Проценты - Несогласие'],
    ['PhoneCC','Вопрос - Номер горячей линии'],
    ['PINcode','Пин код - Уточнение'],
    ['Promo','Акции - Уточнение'],
    ['Promo/Conditions','Акции - Условия'],
    ['Promo/Current','Акции - Актуальные'],
    ['Promo/Participated','Акции - Не зачислены бонусы'],
    ['Refinancing','Рефинансирование - Уточнение'],
    ['Refinancing/Request','Рефинансирование - Оформить - Уточнение'],
    ['Refinancing/Request/CarLoan','Рефинансирование - Оформить - Автокредит'],
    ['Refinancing/Request/ConsumerLoan','Рефинансирование - Оформить - Потреб'],
    ['Refinancing/Request/CreditCard','Рефинансирование - Оформить - Кредитная карта'],
    ['Refinancing/Request/Mortgage','Рефинансирование - Оформить - Ипотека'],
    ['Requisites','Реквизиты - Уточнение'],
    ['Requisites/Bank','Реквизиты - Банка'],
    ['Requisites/CVV','Реквизиты - CVV'],
    ['Restructuring','Кредитные каникулы - Уточнение'],
    ['Restructuring/Request','Кредитные каникулы - Оформить - Уточнение'],
    ['Restructuring/Request/Loan','Кредитные каникулы - Оформить - Кредит'],
    ['Restructuring/Request/Microloan','Кредитные каникулы - Оформить - МКК'],
    ['Restructuring/Status','Кредитные каникулы - Узнать статус'],
    ['Return','Возврат - Уточнение'],
    ['ServiceDesk','Перевод на 5555'],
    ['SMSNotifications','Вопрос - Сервис уведомлений'],
    ['SMSOff','Сервис уведомлений - Отключить'],
    ['SMSOn','Сервис уведомлений - Подключить'],
    ['SMSPrice','Сервис уведомлений - Стоимость'],
    ['StopList','Карта - Стоп лист'],
    ['Subscription','Подписки - Уточнение'],
    ['Subscription/Status','Подписки - Проверить наличие'],
    ['Subscription/TurnOff','Платеж - Отключение подписок / Подписки - Отключить'],
    ['Subscription/TurnOn','Подписки - Подключить'],
    ['SupportRequest','Заявка в СД'],
    ['TimeAsAGift','Время в подарок - Уточнение'],
    ['Trouble','Проблема - Уточнение'],
    ['Trouble/Button','Проблема - Не работает кнопка'],
    ['Trouble/Loan','Проблема - Не могу оформить кредит'],
    ['Unblock','Разблокировать - Уточнение'],
    ['UpdatePassportData','Паспорт - Обновить'],
    ['UralsibBonus','Уралсиб бонус - Уточнение'],
    ['UralsibBonus/Balance','Уралсиб бонус - Информация по бонусам - Баланс'],
    ['UralsibBonus/Categories','Уралсиб бонус - Категории - Уточнение'],
    ['UralsibBonus/Categories/Check','Уралсиб бонус - Категории - Как проверить выбранные категории'],
    ['UralsibBonus/Categories/Choose','Уралсиб бонус - Категории - Как выбрать'],
    ['UralsibBonus/History','Уралсиб бонус - Информация по бонусам - История'],
    ['UralsibBonus/Instructions','Уралсиб бонус - Обмен бонусов - Уточнение'],
    ['UralsibBonus/Instructions/Compensation','Уралсиб бонус - Обмен бонусов - Компенсация покупок'],
    ['UralsibBonus/Instructions/RZD','Уралсиб бонус - Обмен бонусов - РЖД Бонус'],
    ['UralsibBonus/Instructions/Trips','Уралсиб бонус - Обмен бонусов - Путешествия'],
    ['UralsibBonus/Participate','Уралсиб бонус - Подключение'],
    ['UralsibBonus/Problem','Уралсиб бонус - Проблемы'],
    ['UralsibBonus/Question','Уралсиб бонус - Информация по бонусам - Уточнение'],
    ['UralsibBonus/Question/Expiration','Уралсиб бонус - Информация по бонусам - Сроки использования'],
    ['UralsibBonus/Question/NotArrive','Уралсиб бонус - Информация по бонусам - Не зачислены бонусы'],
    ['UralsibBonus/Question/Period','Уралсиб бонус - Информация по бонусам - Сроки зачисления'],
    ['Utilities','ЖКУ - Уточнение'],
    ['Utilities/Bonus','ЖКУ - Участвую в акции']
  ];


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

  // Открывает модалку "Комментарий" и вставляет название темы.
  // Сохранение остаётся за разметчиком.
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
      const rawQuery = query.trim(); // сохраняем исходный регистр/слэши — для варианта "не из списка"
      const q = rawQuery.toLowerCase();

      // Пустой запрос — показываем ВЕСЬ список (можно листать вниз и искать
      // глазами, не зная точного названия стейта), а не прячем список.
      const matches = !q
        ? TOPICS
        : TOPICS.filter(
            ([state, desc]) =>
              state.toLowerCase().includes(q) || (desc && desc.toLowerCase().includes(q))
          );

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

      // Если человек уже что-то ввёл/вставил — добавляем внизу отдельный
      // пункт "тематика не из списка" с его точным текстом. Не показываем
      // его, если введённый текст точь-в-точь совпадает с уже существующей
      // темой (тогда это просто дубль одного из вариантов выше).
      const exactMatchExists = matches.some(([state]) => state.toLowerCase() === q);
      if (rawQuery && !exactMatchExists) {
        const customItem = document.createElement('div');
        customItem.style.cssText =
          'padding:6px 8px;cursor:pointer;font-size:12px;border-top:2px solid #ddd;background:#fafafa;';
        customItem.innerHTML =
          '<div style="font-weight:600;color:#b36b00;">«' + rawQuery + '»</div>' +
          '<div style="color:#999;margin-top:1px;">тематика не из списка — нажмите, чтобы вставить как есть</div>';
        customItem.addEventListener('mouseenter', () => {
          customItem.style.background = '#fff3e0';
        });
        customItem.addEventListener('mouseleave', () => {
          customItem.style.background = '#fafafa';
        });
        customItem.addEventListener('mousedown', (e) => {
          e.preventDefault();
          applyTopicToComment(commentBtn, rawQuery);
          input.value = '';
          list.style.display = 'none';
        });
        list.appendChild(customItem);
      }

      if (!list.children.length) {
        list.style.display = 'none';
        return;
      }

      list.style.display = 'block';
    };

    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('focus', () => renderList(input.value));
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

  console.log('Готово.');
})();
