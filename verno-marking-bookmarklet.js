/**
 * Bookmarklet для быстрой разметки диалогов бота в JCP меткой "Верно".
 *
 * Что делает:
 * 1. Ставит "Верно" и фамилию проверяющего в верхней панели диалога.
 * 2. Проходит по всем сообщениям диалога и ставит "Верно" в каждом,
 *    КРОМЕ сообщений, подпадающих под правила пропуска (см. ниже),
 *    чтобы не тратить время на переразметку заведомо не требующих
 *    разметки сообщений.
 *
 * Правила пропуска (shouldSkip):
 *  - Правило 1 (isClosingMessage): сообщение — автоматическое закрытие
 *    диалога по таймауту (Класс: TimeOutHandler / Стейт: /Goodbye).
 *  - Правило 2 (isButtonClickResponse): реплика клиента дословно совпадает
 *    с текстом одной из кнопок быстрого ответа, показанных в предыдущем
 *    сообщении бота — то есть клиент просто нажал кнопку, а не написал
 *    сообщение сам. Проверяем ответ бота на нажатие кнопки (правильно ли
 *    сработала кнопка) отдельно, на тесте.
 *  - Правило 3 (isPureGreeting): ответ бота — это ровно одна из
 *    стандартных приветственных фраз из HelloHandler (SayRandom),
 *    без какого-либо дополнительного текста. Если бот добавил что-то
 *    ещё сверх приветствия — сообщение размечается как обычно.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 * Это bookmarklet — код должен быть вставлен в поле URL закладки браузера
 * ОДНОЙ СТРОКОЙ, начиная строго с "javascript:" (без пробела после
 * двоеточия). Минифицированную версию для вставки в закладку см. в файле
 * verno-marking-bookmarklet.min.js рядом с этим файлом (либо минифицируй
 * этот файл самостоятельно, убрав переносы строк и комментарии).
 *
 * ВАЖНО ПРИ ИЗМЕНЕНИИ БОТА:
 * Если в HelloHandler изменятся формулировки фраз в SayRandom,
 * нужно вручную обновить список greetingTemplates ниже.
 */

javascript:(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Все сообщения диалога по порядку
  const containers = [...document.querySelectorAll('div.Message_container')];

  // --- Правило 1: закрытие диалога по таймауту ---
  const isClosingMessage = (container) => {
    if (!container) return false;
    const cls = container.querySelector('[data-test-id="phraseClass"]');
    const state = container.querySelector('[data-test-id="phraseState"]');
    const clsText = norm(cls ? cls.innerText : '');
    const stateText = norm(state ? state.innerText : '');
    return clsText.includes('timeouthandler') || stateText.includes('/goodbye');
  };

  // --- Правило 2: реплика клиента = нажатие кнопки быстрого ответа ---
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

  // --- Правило 3: чистое приветствие из HelloHandler, без доп. текста ---
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
  // Шаблоны фраз из SayRandom (HelloHandler), с NAME_TOKEN вместо {{ $session.name }}
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

  // Общая точка расширения для правил пропуска (сюда добавлять новые правила)
  const shouldSkip = (container, prevContainer) => {
    return (
      isClosingMessage(container) ||
      isButtonClickResponse(container, prevContainer) ||
      isPureGreeting(container)
    );
  };

  // Кнопка "Верно" именно в метке сообщения (не путать с быстрыми кнопками бота)
  const getVernoButtonInContainer = (container) => {
    return [...container.querySelectorAll('button.Message_label_button')].find(
      (b) => b.innerText.trim() === 'Верно'
    );
  };

  // 1. Верхняя панель: "Верно" для всего диалога
  const topLabelsButtons = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ];
  let topBtn = topLabelsButtons.find((b) => b.innerText.trim() === 'Верно');
  if (topBtn) {
    topBtn.click();
    await sleep(300);
  }

  // 2. Верхняя панель: фамилия проверяющего
  let surnameBtn = [
    ...document.querySelectorAll('.labelGroups_container button.Message_label_button'),
  ].find((b) => b.innerText.trim() === '.Ведерников И. Ю.');
  if (surnameBtn) {
    surnameBtn.click();
    await sleep(300);
  }

  // 3. Диагностика в консоль (можно закомментировать/удалить перед боевым использованием)
  containers.forEach((c, i) => {
    console.log('Сообщение №' + (i + 1), {
      clientText: getClientText(c),
      botText: getBotText(c),
      isGreeting: isPureGreeting(c),
      willSkip: shouldSkip(c, containers[i - 1]),
    });
  });

  // 4. Кликаем "Верно" в каждом сообщении, пропуская нужные
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const prev = containers[i - 1];
    if (shouldSkip(container, prev)) continue;

    const btn = getVernoButtonInContainer(container);
    if (btn) {
      btn.click();
      await sleep(300);
    }
  }

  await sleep(500);
  console.log('Готово.');
})();
