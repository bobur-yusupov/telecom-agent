// 23 KB chunks sourced from FAQs.md. Each chunk covers one FAQ entry.
// question/answer are in Tajik + Russian. English/Uzbek responses are generated
// at inference time by the model from this content.

export interface KBChunk {
  chunkId: string
  group: string
  type: 'FAQ' | 'KB'
  question: string  // Tajik / Russian combined
  answer: string    // Tajik / Russian combined
  toolTags: string[]
  keywordTags: string[]  // multilingual — used by TF-IDF retriever
}

export const chunks: KBChunk[] = [
  // ── Billing & payments ──────────────────────────────────────────────────────
  {
    chunkId: 'BIL-001',
    group: 'billing',
    type: 'FAQ',
    question: 'Чаро ҳисобнома зиёдтар аст? / Почему мой счёт выше ожидаемого?',
    answer:
      'Ҳисобнома метавонад аз сабаби истифодаи иловагии интернет, роуминг ё пардохти нопурраи моҳи гузашта баланд бошад. ' +
      'Счёт может быть выше из-за превышения лимита данных, роуминга или задолженности за прошлый месяц.',
    toolTags: ['getInvoice'],
    keywordTags: [
      'ҳисобнома', 'зиёд', 'счёт', 'выше', 'ожидаемый', 'bill', 'invoice', 'higher',
      'роуминг', 'roaming', 'лимит', 'limit', 'hisob', 'ortiqcha',
    ],
  },
  {
    chunkId: 'BIL-002',
    group: 'billing',
    type: 'FAQ',
    question: 'Чӣ тавр пардохт кунам? / Как оплатить счёт?',
    answer:
      'NovaTel имкон медиҳад тавассути Koronabank, Alif Bank, Orion Pay ва USSD *100# пардохт кунед. ' +
      'Оплата доступна через Koronabank, Alif Bank, Orion Pay и USSD *100#.',
    toolTags: ['getPaymentMethods'],
    keywordTags: [
      'пардохт', 'payment', 'оплата', 'Koronabank', 'Alif', 'USSD', 'pay',
      'tölash', 'tolov', '*100#',
    ],
  },
  {
    chunkId: 'BIL-003',
    group: 'billing',
    type: 'FAQ',
    question: 'Агар пардохт нашавад чӣ мешавад? / Что будет если не платить?',
    answer:
      'Пас аз 7 рӯз огоҳӣ, пас аз 14 рӯз маҳдудият, пас аз 30 рӯз суперпозитсия. ' +
      'После 7 дней — предупреждение, 14 дней — ограничение, 30 дней — приостановка.',
    toolTags: [],
    keywordTags: [
      'пардохт', 'таъхир', 'suspension', 'приостановка', 'ограничение', 'задолженность',
      'overdue', 'late', 'deadline', 'tolov', 'muddati',
    ],
  },
  {
    chunkId: 'BIL-004',
    group: 'billing',
    type: 'FAQ',
    question: 'Ман хато пардохт кардам / Я ошибочно оплатил не тот номер',
    answer:
      'Дар давоми 24 соат мурофиа кунед. Агент дархости баргардонидани маблағро тартиб медиҳад. ' +
      'Обратитесь в течение 24 часов, агент оформит запрос на возврат.',
    toolTags: ['escalateToHuman'],
    keywordTags: [
      'хато', 'ошибка', 'wrong number', 'refund', 'возврат', 'баргардонидан',
      'noto\'g\'ri', 'xato', 'qaytarish',
    ],
  },

  // ── Top-up & balance ────────────────────────────────────────────────────────
  {
    chunkId: 'TOP-001',
    group: 'topup',
    type: 'FAQ',
    question: 'Чӣ тавр счёт пур кунам? / Как пополнить счёт?',
    answer:
      'USSD *110*сумма# | Alifmobile | нуқтаҳои NovaTel | картаи пардохт. Ҳадди ақал 5 сомонӣ. ' +
      'Пополнение через *110*сумма#, Alifmobile, офисы NovaTel. Минимум 5 сомони.',
    toolTags: ['getPaymentMethods'],
    keywordTags: [
      'пурсозӣ', 'пополнение', 'topup', 'top-up', 'balance', 'баланс', 'USSD', '*110#',
      'Alifmobile', 'hisobni', 'to\'ldirish',
    ],
  },
  {
    chunkId: 'TOP-002',
    group: 'topup',
    type: 'FAQ',
    question: 'Аз хориҷа пурсозӣ кардан мумкин аст? / Можно пополнить из-за рубежа?',
    answer:
      'Бале, тавассути Western Union, Koronabank ё аъзои оила дар Тоҷикистон. ' +
      'Да, через Western Union, Koronabank или родственников внутри страны.',
    toolTags: [],
    keywordTags: [
      'хориҷа', 'заграница', 'abroad', 'international topup', 'Western Union', 'Koronabank',
      'chet el', 'xorijdan',
    ],
  },
  {
    chunkId: 'TOP-003',
    group: 'topup',
    type: 'FAQ',
    question: 'Мӯҳлати эътибори пурсозӣ / Срок действия пополнения',
    answer:
      'Пурсозӣ то 90 рӯз эътибор дорад. Агар истифода нашавад, маблағ мемонад вале рақам хомӯш мешавад. ' +
      'Пополнение действует 90 дней. Баланс сохраняется при активном номере.',
    toolTags: [],
    keywordTags: [
      'мӯҳлат', 'срок', 'expiry', 'validity', '90 days', '90 рӯз', 'active', 'фаъол',
    ],
  },
  {
    chunkId: 'TOP-004',
    group: 'topup',
    type: 'FAQ',
    question: 'Маблағи пурсозӣ ворид нашуд / Пополнение не зачислилось',
    answer:
      'Агент тафтиш мекунад. Дар сурати тасдиқи пардохт дар давоми 1 соат ворид мешавад. ' +
      'Агент проверит статус и при подтверждённой оплате зачислит в течение 1 часа.',
    toolTags: ['applyCredit', 'escalateToHuman'],
    keywordTags: [
      'ворид нашуд', 'не зачислилось', 'not credited', 'missing topup', 'пурсозӣ',
      'tushmaди', 'kelmadi',
    ],
  },

  // ── Plans & upgrades ────────────────────────────────────────────────────────
  {
    chunkId: 'PLN-001',
    group: 'plans',
    type: 'FAQ',
    question: 'Кадом нақша барои ман беҳтар аст? / Какой тариф мне подходит?',
    answer:
      'Агент мепурсад: чанд ГБ, зангҳо зарур аст? Сипас нақшаи мувофиқро пешниҳод мекунад. ' +
      'Агент уточнит объём данных и звонки, затем предложит подходящий тариф.',
    toolTags: ['listPlans', 'comparePlans'],
    keywordTags: [
      'нақша', 'тариф', 'plan', 'best plan', 'suitable', 'мувофиқ', 'подходит',
      'tarif', 'qaysi', 'yaxshi',
    ],
  },
  {
    chunkId: 'PLN-002',
    group: 'plans',
    type: 'FAQ',
    question: 'Нақша иваз кардан маблағи иловагӣ дорад? / Смена тарифа платная?',
    answer:
      'Иваз кардан ройгон аст. Нақшаи нав аз аввали моҳи оянда фаъол мешавад. ' +
      'Смена тарифа бесплатна и вступает в силу с 1-го числа следующего месяца.',
    toolTags: ['changePlan'],
    keywordTags: [
      'иваз', 'смена', 'change plan', 'free', 'ройгон', 'бесплатно', 'next month',
      'oydan', 'almashtirish', 'tarif',
    ],
  },
  {
    chunkId: 'PLN-003',
    group: 'plans',
    type: 'FAQ',
    question: 'Нақшаҳои оилавӣ чӣ гуна кор мекунанд? / Как работают семейные тарифы?',
    answer:
      'Нақшаи "Оила" то 4 рақамро муттаҳид мекунад. Маълумот умумӣ аст. ' +
      'Тариф "Семейный" объединяет до 4 номеров с общим пакетом данных.',
    toolTags: ['listPlans'],
    keywordTags: [
      'оилавӣ', 'семейный', 'family plan', 'shared data', 'оила', 'family',
      'oilaviy', 'shared',
    ],
  },
  {
    chunkId: 'PLN-004',
    group: 'plans',
    type: 'FAQ',
    question: 'Маълумот ба охир расид, чӣ кор кунам? / Закончился интернет, что делать?',
    answer:
      'Пакети иловагӣ: 1GB — 8 сомонӣ, 3GB — 20 сомонӣ, 10GB — 55 сомонӣ. USSD *130# ё тавассути агент. ' +
      'Докупите пакет данных через *130# или агента.',
    toolTags: ['getDataAddons', 'purchaseAddon'],
    keywordTags: [
      'маълумот', 'данные', 'internet', 'data', 'addon', 'иловагӣ', 'докупить',
      'internet', '*130#', 'GB', 'internet tamom', 'tugatdi',
    ],
  },

  // ── Technical support ───────────────────────────────────────────────────────
  {
    chunkId: 'TEC-001',
    group: 'technical',
    type: 'FAQ',
    question: 'Интернет кор намекунад / Интернет не работает',
    answer:
      'Телефонро хомӯш карда дубора васл кунед. Режими парвозро фаъол ва ғайрифаъол кунед. ' +
      'Агент аварияи минтақавиро тафтиш мекунад. ' +
      'Перезагрузите телефон. Включите/выключите авиарежим. Агент проверит аварии в районе.',
    toolTags: ['checkOutage', 'runDiagnostic', 'createTicket'],
    keywordTags: [
      'интернет', 'кор намекунад', 'не работает', 'no internet', 'offline', 'connection',
      'ishlayapti', 'ishlamayapti', 'internet yo\'q',
    ],
  },
  {
    chunkId: 'TEC-002',
    group: 'technical',
    type: 'FAQ',
    question: 'Суръати интернет паст аст / Интернет очень медленный',
    answer:
      'Сабабҳо: маълумот тамом шудааст, вақти пурбории шабака (8-22 соат), масофа аз бурҷ. ' +
      'Причины: лимит данных исчерпан, загрузка сети, удалённость от вышки.',
    toolTags: ['runDiagnostic', 'getDataAddons'],
    keywordTags: [
      'суръат', 'паст', 'медленный', 'slow', 'speed', 'slow internet', 'сигнал',
      'tezlik', 'sekin', 'slow connection',
    ],
  },
  {
    chunkId: 'TEC-003',
    group: 'technical',
    type: 'KB',
    question: 'Минтақаҳои пӯшиши NovaTel / Зоны покрытия NovaTel',
    answer:
      '4G: Душанбе, Хуҷанд, Бохтар, Кӯлоб, Истаравшан. 3G: аксари шаҳрҳо. 2G: деҳот. novatel.tj/coverage. ' +
      '4G: Душанбе, Худжанд, Бохтар, Куляб. 3G: большинство городов. 2G: сельская местность.',
    toolTags: ['checkOutage'],
    keywordTags: [
      'пӯшиш', 'покрытие', 'coverage', '4G', '3G', '2G', 'Душанбе', 'Хуҷанд', 'Кӯлоб',
      'zone', 'qamrov', 'mintaqa',
    ],
  },
  {
    chunkId: 'TEC-004',
    group: 'technical',
    type: 'FAQ',
    question: 'Симкарта кор намекунад / SIM-карта не работает',
    answer:
      'Симкартаро аз телефон бароред ва дубора гузоред. Агар ҳал нашавад — симкартаи нав бо рақами кӯҳна. ' +
      'Извлеките и вставьте SIM заново. Если не помогает — замена SIM с сохранением номера, нужен визит в офис.',
    toolTags: ['runDiagnostic', 'createTicket', 'escalateToHuman'],
    keywordTags: [
      'SIM', 'симкарта', 'SIM card', 'не работает', 'кор намекунад', 'replacement',
      'SIM almashtirish', 'SIM ishlamayapti',
    ],
  },
  {
    chunkId: 'TEC-005',
    group: 'technical',
    type: 'KB',
    question: 'Суръати 4G ва 3G — чӣ интизор шавам? / Скорости 4G и 3G',
    answer:
      '4G: то 50 Mbps зеробор, 20 Mbps болобор. 3G: то 7 Mbps. Суръати воқеӣ аз шароит вобаста аст. ' +
      '4G: до 50 Mbps загрузка. 3G: до 7 Mbps. Реальная скорость зависит от загрузки сети.',
    toolTags: [],
    keywordTags: [
      '4G speed', '3G speed', 'Mbps', 'download', 'upload', 'суръат', 'скорость',
      'tezlik', 'real speed',
    ],
  },

  // ── Roaming & international ─────────────────────────────────────────────────
  {
    chunkId: 'ROA-001',
    group: 'roaming',
    type: 'FAQ',
    question: 'Оё роуминг дар Русия/Узбекистон/Қазоқистон мавҷуд аст? / Есть ли роуминг?',
    answer:
      'Бале. Шарикон: МТС (Русия), Beeline (Узбекистон, Қазоқистон), Kcell (Қазоқистон). ' +
      'Нархи роуминг: зангҳо 1.2 сомонӣ/дақ, маълумот 0.8 сомонӣ/MB. ' +
      'Да. Партнёры: МТС (Россия), Beeline (Узбекистан, Казахстан), Kcell (Казахстан).',
    toolTags: [],
    keywordTags: [
      'роуминг', 'roaming', 'Россия', 'Узбекистон', 'Казахстан', 'abroad', 'МТС', 'Beeline',
      'xorijda', 'roaming bor',
    ],
  },
  {
    chunkId: 'ROA-002',
    group: 'roaming',
    type: 'FAQ',
    question: 'Чӣ тавр роумингро фаъол кунам? / Как активировать роуминг?',
    answer:
      'USSD *150*1# — фаъолсозӣ. *150*0# — ғайрифаъолсозӣ. Арзиш 10 сомонӣ/моҳ. ' +
      'Активация: *150*1#. Отключение: *150*0#. Стоимость 10 сомони/месяц.',
    toolTags: [],
    keywordTags: [
      'роуминг фаъол', 'activate roaming', 'активировать роуминг', '*150*1#', '*150*0#',
      'roaming yoqish', 'roaming ochish',
    ],
  },
  {
    chunkId: 'ROA-003',
    group: 'roaming',
    type: 'FAQ',
    question: 'Роуминг гарон аст, алтернатива ҳаст? / Роуминг дорогой, есть альтернатива?',
    answer:
      'Бастаи "Роуминг Плюс": 500 MB + 100 дақ ба Тоҷикистон — 35 сомонӣ/моҳ. ' +
      'Пакет "Роуминг Плюс": 500 MB + 100 минут звонков домой — 35 сомони/месяц.',
    toolTags: ['listPlans'],
    keywordTags: [
      'роуминг арзон', 'cheap roaming', 'роуминг плюс', 'roaming plus', 'alternative',
      'arzonroq', 'roaming paketi',
    ],
  },

  // ── Cancellation & retention ─────────────────────────────────────────────────
  {
    chunkId: 'RET-001',
    group: 'retention',
    type: 'FAQ',
    question: 'Мехоҳам хидматро бекор кунам / Хочу отключить услугу',
    answer:
      'Пеш аз бекор кардан агент сабабро мепурсад. Агар нарх — тахфиф. Агар сифат — эскалатсия. ' +
      'Перед отключением уточним причину. Если цена — предложим скидку. Если качество — эскалируем.',
    toolTags: ['getRetentionOffers', 'applyDiscount', 'escalateToHuman'],
    keywordTags: [
      'бекор кардан', 'отключить', 'cancel', 'cancellation', 'уйти', 'leave',
      'bekor', 'chiqib ketish', 'отмена',
    ],
  },
  {
    chunkId: 'RET-002',
    group: 'retention',
    type: 'KB',
    question: 'Сиёсати бекоркунӣ / Политика отмены',
    answer:
      'Бекор кардан ҳар вақт имконпазир аст. Маблағи боқимонда баргардонида намешавад. Рақам 90 рӯз нигоҳ дошта мешавад. ' +
      'Отмена доступна в любое время. Остаток не возвращается. Номер резервируется 90 дней.',
    toolTags: [],
    keywordTags: [
      'сиёсат', 'политика', 'cancellation policy', 'refund', 'number reservation',
      'raqam saqlanadi', '90 kun', '90 дней',
    ],
  },
  {
    chunkId: 'RET-003',
    group: 'retention',
    type: 'FAQ',
    question: 'Ба оператори дигар гузаштан мехоҳам / Хочу перейти к другому оператору',
    answer:
      'Рақамро нигоҳ доштан мумкин аст (MNP). Мӯҳлати интиқол — 3 рӯзи корӣ. ' +
      'Перенос номера (MNP) занимает 3 рабочих дня. Агент предложит альтернативу.',
    toolTags: ['getRetentionOffers', 'comparePlans', 'escalateToHuman'],
    keywordTags: [
      'оператори дигар', 'другой оператор', 'MNP', 'port number', 'switch operator',
      'boshqa operator', 'raqam ko\'chirish',
    ],
  },
]
