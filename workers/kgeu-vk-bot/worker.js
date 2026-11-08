const APP_ID = 54754459;
const COMMUNITY_ID = 241328142;
const VK_API_VERSION = "5.199";

const APP_URL =
  "https://mitrofanovdaniil53-max.github.io/kgeu-schedule-vk/index.html";

const API_RASP = "https://kabinet.kgeu.ru/api/Rasp";
const API_GROUPS =
  "https://kabinet.kgeu.ru/api/raspGrouplist?year=2026-2027";

const YEAR = "2026-2027";
const TZ = "Europe/Moscow";

const DAILY_HOUR = 7;
const REMINDER_MINUTES = 15;
const CRON_MINUTES = 5;

const USER_PREFIX = "user:";
const GROUP_CACHE_KEY = "cache:groups";
const GROUP_CACHE_TTL = 6 * 60 * 60 * 1000;


/* =========================================================
   TIME
========================================================= */

function moscowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function isoDateInMoscow(date = new Date()) {
  const p = moscowParts(date);

  return (
    `${p.year}-` +
    `${String(p.month).padStart(2, "0")}-` +
    `${String(p.day).padStart(2, "0")}`
  );
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}


/* =========================================================
   USERS / KV
========================================================= */

function userKey(vkId) {
  return `${USER_PREFIX}${vkId}`;
}

async function getUser(env, vkId) {
  if (!env.KGEU_VK_USERS) {
    throw new Error("KV binding KGEU_VK_USERS is missing");
  }

  try {
    const raw = await env.KGEU_VK_USERS.get(userKey(vkId));

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (e) {
    console.error("getUser ERROR:", e?.stack || e);
    return null;
  }
}

async function saveUser(env, user) {
  if (!env.KGEU_VK_USERS) {
    throw new Error("KV binding KGEU_VK_USERS is missing");
  }

  const clean = {
    vkId: Number(user.vkId),

    firstName: user.firstName || null,
    lastName: user.lastName || null,
    username: user.username || null,

    groupId:
      user.groupId != null
        ? Number(user.groupId)
        : null,

    groupName: user.groupName || null,

    faculty: user.faculty || null,
    facultyId: user.facultyId ?? null,
    course: user.course ?? null,

    notifications:
      user.notifications !== false,

    dailyNotifications:
      user.dailyNotifications !== false,

    reminderNotifications:
      user.reminderNotifications !== false,

    changeNotifications:
      user.changeNotifications !== false,

    state: user.state || null,

    createdAt:
      user.createdAt || Date.now(),

    updatedAt: Date.now(),
  };

  await env.KGEU_VK_USERS.put(
    userKey(clean.vkId),
    JSON.stringify(clean)
  );

  return clean;
}

async function ensureUser(env, msg) {
  const vkId = Number(msg.from_id);

  if (!Number.isFinite(vkId) || vkId <= 0) {
    throw new Error(
      `Invalid VK user id: ${msg.from_id}`
    );
  }

  let user = await getUser(env, vkId);

  if (!user) {
    user = await saveUser(env, {
      vkId,

      firstName:
        msg.first_name || null,

      lastName:
        msg.last_name || null,

      username: null,

      notifications: true,
      dailyNotifications: true,
      reminderNotifications: true,
      changeNotifications: true,
    });
  } else {
    user.firstName =
      msg.first_name || user.firstName;

    user.lastName =
      msg.last_name || user.lastName;

    user = await saveUser(env, user);
  }

  return user;
}


/* =========================================================
   VK API
========================================================= */

async function vkApi(env, method, params = {}) {
  if (!env.VK_TOKEN) {
    throw new Error(
      "VK_TOKEN secret is missing"
    );
  }

  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null
    ) {
      body.set(
        key,
        typeof value === "object"
          ? JSON.stringify(value)
          : String(value)
      );
    }
  }

  body.set(
    "access_token",
    env.VK_TOKEN
  );

  body.set(
    "v",
    VK_API_VERSION
  );

  const response = await fetch(
    `https://api.vk.com/method/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const rawText = await response.text();

  let data;

  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      `${method}: VK returned non-JSON response: ${rawText.slice(
        0,
        500
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${method}: HTTP ${response.status}: ${rawText.slice(
        0,
        500
      )}`
    );
  }

  if (data.error) {
    throw new Error(
      `${method}: ` +
        `${data.error.error_code} ` +
        `${data.error.error_msg}`
    );
  }

  return data.response;
}

async function sendMessage(
  env,
  peerId,
  message,
  keyboard = null
) {
  const params = {
    peer_id: Number(peerId),
    random_id:
      Math.floor(
        Math.random() * 2147483647
      ),
    message: String(message),
  };

  if (keyboard) {
    params.keyboard = keyboard;
  }

  return vkApi(
    env,
    "messages.send",
    params
  );
}


/* =========================================================
   KEYBOARDS
========================================================= */

function openAppButton(user) {
  let hash = "";

  if (user?.groupId) {
    hash =
      `groupId=${encodeURIComponent(
        user.groupId
      )}` +
      `&groupName=${encodeURIComponent(
        user.groupName || ""
      )}` +
      `&institute=${encodeURIComponent(
        user.faculty || ""
      )}`;
  }

  return {
    action: {
      type: "open_app",
      label: "📱 Открыть расписание",
      app_id: APP_ID,
      owner_id: -COMMUNITY_ID,
      hash,
    },
  };
}

function textButton(
  label,
  color = "secondary"
) {
  return {
    action: {
      type: "text",
      label: String(label).slice(0, 40),
    },
    color,
  };
}

function mainKeyboard(user) {
  return {
    one_time: false,
    inline: false,

    buttons: [
      [
        openAppButton(user),
      ],

      [
        textButton(
          "📅 Расписание",
          "primary"
        ),

        textButton(
          "👥 Сменить группу",
          "secondary"
        ),
      ],

      [
        textButton(
          "🔔 Уведомления",
          "secondary"
        ),

        textButton(
          "ℹ️ Помощь",
          "secondary"
        ),
      ],
    ],
  };
}

function backKeyboard() {
  return {
    one_time: false,
    inline: false,

    buttons: [
      [
        textButton(
          "⬅️ Назад",
          "secondary"
        ),
      ],

      [
        textButton(
          "📅 Расписание",
          "primary"
        ),
      ],
    ],
  };
}

function facultyKeyboard(faculties) {
  const buttons = [];

  for (
    const faculty of faculties.slice(0, 40)
  ) {
    buttons.push(
      textButton(
        faculty.label,
        "secondary"
      )
    );
  }

  const rows = [];

  for (
    let i = 0;
    i < buttons.length;
    i += 2
  ) {
    rows.push(
      buttons.slice(i, i + 2)
    );
  }

  rows.push([
    textButton(
      "⬅️ Назад",
      "secondary"
    ),
  ]);

  return {
    one_time: false,
    inline: false,
    buttons: rows,
  };
}

function courseKeyboard() {
  return {
    one_time: false,
    inline: false,

    buttons: [
      [
        textButton("1 курс"),
        textButton("2 курс"),
      ],

      [
        textButton("3 курс"),
        textButton("4 курс"),
      ],

      [
        textButton("5 курс"),
        textButton(
          "⬅️ Назад"
        ),
      ],
    ],
  };
}

function groupInputKeyboard() {
  return {
    one_time: false,
    inline: false,
    buttons: [
      [
        textButton(
          "⬅️ К курсам",
          "secondary"
        ),
      ],
    ],
  };
}

function notificationKeyboard(user) {
  const mark = (value) =>
    value ? "✅" : "⬜";

  return {
    one_time: false,
    inline: false,

    buttons: [
      [
        textButton(
          `${mark(
            user.dailyNotifications
          )} 07:00 — расписание`
        ),
      ],

      [
        textButton(
          `${mark(
            user.reminderNotifications
          )} За 15 минут`
        ),
      ],

      [
        textButton(
          `${mark(
            user.changeNotifications
          )} Изменения / замены`
        ),
      ],

      [
        textButton(
          "⬅️ Назад",
          "secondary"
        ),
      ],
    ],
  };
}


/* =========================================================
   TEXT / GROUPS
========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGroups(raw) {
  const arr =
    Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : [];

  return arr
    .map((g) => ({
      id: Number(
        g.id ??
        g.ID ??
        g.idGroup
      ),

      name: normalizeText(
        g.name ??
        g.название ??
        g.groupName
      ),

      course:
        Number(
          g.kurs ??
          g.course ??
          g.Kurs ??
          0
        ) || null,

      faculty: normalizeText(
        g.facul ??
        g.faculty ??
        g.fakultet
      ),

      facultyId:
        g.facultyID ??
        g.facultyId ??
        null,
    }))

    .filter(
      (g) =>
        Number.isFinite(g.id) &&
        g.name
    );
}

async function loadGroups(env) {
  if (!env.KGEU_VK_USERS) {
    throw new Error(
      "KV binding KGEU_VK_USERS is missing"
    );
  }

  const cached =
    await env.KGEU_VK_USERS.get(
      GROUP_CACHE_KEY
    );

  if (cached) {
    try {
      const obj =
        JSON.parse(cached);

      if (
        obj.ts &&
        Date.now() - obj.ts <
          GROUP_CACHE_TTL &&
        Array.isArray(obj.groups)
      ) {
        return obj.groups;
      }
    } catch (e) {
      console.error(
        "GROUP CACHE PARSE ERROR:",
        e
      );
    }
  }

  const response = await fetch(
    API_GROUPS,
    {
      cf: {
        cacheTtl: 3600,
        cacheEverything: true,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Groups API HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  const groups =
    normalizeGroups(json);

  if (!groups.length) {
    throw new Error(
      "Group directory is empty"
    );
  }

  await env.KGEU_VK_USERS.put(
    GROUP_CACHE_KEY,
    JSON.stringify({
      ts: Date.now(),
      groups,
    }),
    {
      expirationTtl:
        12 * 60 * 60,
    }
  );

  return groups;
}

function uniqueFaculties(groups) {
  const map = new Map();

  for (const g of groups) {
    const facultyName = String(
      g.faculty ?? ""
    ).trim();

    // Не показываем записи без названия факультета
    if (!facultyName) {
      continue;
    }

    const key =
      `${g.facultyId ?? ""}|${facultyName}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        label: facultyName,
        faculty: facultyName,
        facultyId:
          g.facultyId ?? null,
      });
    }
  }

  return [
    ...map.values(),
  ].sort(
    (a, b) =>
      a.label.localeCompare(
        b.label,
        "ru"
      )
  );
}

function getFacultyByLabel(
  groups,
  label
) {
  const target =
    normalizeText(label);

  return (
    uniqueFaculties(groups)
      .find(
        (f) =>
          f.label === target
      ) || null
  );
}

function getCourseGroups(
  groups,
  faculty,
  course
) {
  return groups
    .filter((g) => {
      const facultyMatch =
        (
          faculty.facultyId != null &&
          String(g.facultyId) ===
            String(
              faculty.facultyId
            )
        ) ||
        (
          faculty.faculty &&
          g.faculty ===
            faculty.faculty
        );

      return (
        facultyMatch &&
        Number(g.course) ===
          Number(course)
      );
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru"
        )
    );
}

function findGroup(
  groups,
  text
) {
  const target =
    normalizeText(text)
      .toLowerCase();

  if (!target) {
    return null;
  }

  const exact =
    groups.find(
      (g) =>
        g.name
          .toLowerCase() ===
        target
    );

  if (exact) {
    return exact;
  }

  return (
    groups.find(
      (g) =>
        g.name
          .toLowerCase()
          .includes(target)
    ) || null
  );
}


/* =========================================================
   SCHEDULE PARSING
========================================================= */

function parseLessonDate(
  lesson
) {
  const raw =
    lesson?.дата ??
    lesson?.date ??
    lesson?.Date ??
    lesson?.Дата ??
    lesson?.датаЗанятия ??
    "";

  const s =
    String(raw).trim();

  const m = s.match(
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/
  );

  if (m) {
    return (
      `${m[1]}-` +
      `${String(m[2]).padStart(2, "0")}-` +
      `${String(m[3]).padStart(2, "0")}`
    );
  }

  const m2 = s.match(
    /(\d{1,2})[.](\d{1,2})[.](\d{4})/
  );

  if (m2) {
    return (
      `${m2[3]}-` +
      `${String(m2[2]).padStart(2, "0")}-` +
      `${String(m2[1]).padStart(2, "0")}`
    );
  }

  return null;
}

function lessonStart(lesson) {
  return normalizeText(
    lesson?.начало ??
    lesson?.началоЗанятия ??
    lesson?.timeStart ??
    lesson?.start ??
    lesson?.ВремяНачала ??
    ""
  );
}

function lessonEnd(lesson) {
  return normalizeText(
    lesson?.конец ??
    lesson?.окончание ??
    lesson?.конецЗанятия ??
    lesson?.timeEnd ??
    lesson?.end ??
    lesson?.ВремяОкончания ??
    ""
  );
}

function lessonSubject(lesson) {
  return normalizeText(
    lesson?.дисциплина ??
    lesson?.предмет ??
    lesson?.subject ??
    lesson?.name ??
    lesson?.Название ??
    "Занятие"
  );
}

function lessonTeacher(lesson) {
  return normalizeText(
    lesson?.фиоПреподавателя ??
    lesson?.преподаватель ??
    lesson?.teacher ??
    lesson?.teacherName ??
    lesson?.ФИОПреподавателя ??
    ""
  );
}

function lessonRoom(lesson) {
  return normalizeText(
    lesson?.аудитория ??
    lesson?.кабинет ??
    lesson?.room ??
    lesson?.auditory ??
    lesson?.Аудитория ??
    ""
  );
}

function lessonType(lesson) {
  return normalizeText(
    lesson?.видЗанятия ??
    lesson?.типЗанятия ??
    lesson?.type ??
    lesson?.вид ??
    ""
  );
}

function lessonCode(lesson) {
  return String(
    lesson?.код ??
    lesson?.кодЗанятия ??
    lesson?.id ??
    lesson?.ID ??
    `${lessonStart(
      lesson
    )}|${lessonSubject(
      lesson
    )}|${lessonTeacher(
      lesson
    )}`
  );
}

function normalizeLessons(
  json,
  date
) {
  const candidates = [
    json?.data?.rasp,
    json?.data,
    json?.rasp,
    json?.result,
    Array.isArray(json)
      ? json
      : null,
  ];

  const arr =
    candidates.find(
      Array.isArray
    ) || [];

  return arr
    .map((lesson) => ({
      ...lesson,
      __date:
        parseLessonDate(
          lesson
        ) || date,
    }))

    .filter(
      (lesson) => {
        const parsed =
          parseLessonDate(
            lesson
          );

        return (
          !parsed ||
          parsed === date
        );
      }
    )

    .sort(
      (a, b) =>
        lessonStart(a).localeCompare(
          lessonStart(b),
          "ru"
        )
    );
}

async function fetchSchedule(
  groupId,
  date
) {
  const url =
    new URL(API_RASP);

  url.searchParams.set(
    "idGroup",
    String(groupId)
  );

  url.searchParams.set(
    "sdate",
    date
  );

  const response =
    await fetch(
      url.toString(),
      {
        cf: {
          cacheTtl: 60,
          cacheEverything: true,
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `Schedule API HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  return normalizeLessons(
    json,
    date
  );
}


/* =========================================================
   SCHEDULE FORMAT
========================================================= */

function formatDateRu(iso) {
  const d =
    new Date(
      `${iso}T12:00:00+03:00`
    );

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
    }
  ).format(d);
}

function formatLesson(
  lesson,
  index
) {
  const start =
    lessonStart(lesson);

  const end =
    lessonEnd(lesson);

  const time =
    start && end
      ? `${start}–${end}`
      : start ||
        "Время не указано";

  const lines = [
    `${index + 1}. ${time} — ${lessonSubject(
      lesson
    )}`,
  ];

  const teacher =
    lessonTeacher(lesson);

  const room =
    lessonRoom(lesson);

  const type =
    lessonType(lesson);

  if (teacher) {
    lines.push(
      `   Преподаватель: ${teacher}`
    );
  }

  if (room) {
    lines.push(
      `   Аудитория: ${room}`
    );
  }

  if (type) {
    lines.push(
      `   Тип: ${type}`
    );
  }

  return lines.join("\n");
}

function formatScheduleText(
  groupName,
  date,
  lessons
) {
  const header =
    `📅 ${formatDateRu(
      date
    )}\n` +
    `👥 ${groupName}\n`;

  if (!lessons.length) {
    return (
      `${header}\n` +
      "Занятий нет."
    );
  }

  return (
    `${header}\n` +
    lessons
      .map(
        (lesson, index) =>
          formatLesson(
            lesson,
            index
          )
      )
      .join("\n\n")
  );
}

function timeToMinutes(s) {
  const m = String(s).match(
    /(\d{1,2})[:.](\d{2})/
  );

  if (!m) {
    return null;
  }

  return (
    Number(m[1]) * 60 +
    Number(m[2])
  );
}

function lessonSignature(
  lesson
) {
  return [
    lessonCode(lesson),
    lessonStart(lesson),
    lessonEnd(lesson),
    lessonSubject(lesson),
    lessonTeacher(lesson),
    lessonRoom(lesson),
    lessonType(lesson),
  ].join("¦");
}

function scheduleSignature(
  lessons
) {
  return lessons
    .map(lessonSignature)
    .join("¶");
}


/* =========================================================
   USER COMMANDS
========================================================= */

async function sendCurrentSchedule(
  env,
  peerId,
  user
) {
  if (!user.groupId) {
    await sendMessage(
      env,
      peerId,
      "Сначала выбери учебную группу. Нажми «👥 Сменить группу».",
      mainKeyboard(user)
    );

    return;
  }

  const date =
    isoDateInMoscow();

  const lessons =
    await fetchSchedule(
      user.groupId,
      date
    );

  await sendMessage(
    env,
    peerId,
    formatScheduleText(
      user.groupName ||
        `ID ${user.groupId}`,
      date,
      lessons
    ),
    mainKeyboard(user)
  );
}

async function sendStart(
  env,
  peerId,
  user
) {
  if (user.groupId) {
    await sendMessage(
      env,
      peerId,

      `Привет${
        user.firstName
          ? ", " + user.firstName
          : ""
      }!\n\n` +
        `Твоя группа: ${user.groupName}.\n` +
        "Выбирай действие ниже.",

      mainKeyboard(user)
    );

    return;
  }

  user.state = "faculty";

  await saveUser(
    env,
    user
  );

  const groups =
    await loadGroups(env);

  await sendMessage(
    env,
    peerId,

    "Привет! Это бот расписания КГЭУ.\n\n" +
      "Сначала выбери институт / факультет:",

    facultyKeyboard(
      uniqueFaculties(groups)
    )
  );
}

async function sendHelp(
  env,
  peerId,
  user
) {
  await sendMessage(
    env,
    peerId,

    "Команды и возможности:\n\n" +
      "📅 Расписание — расписание на сегодня\n" +
      "👥 Сменить группу — выбрать другую группу\n" +
      "🔔 Уведомления — управление уведомлениями\n" +
      "📱 Открыть расписание — запустить Mini App\n\n" +
      "Ежедневное расписание отправляется в 07:00 по Москве. " +
      "Также можно включить напоминание за 15 минут и уведомления об изменениях.",

    mainKeyboard(user)
  );
}

async function startGroupSelection(
  env,
  peerId,
  user
) {
  user.state = "faculty";

  await saveUser(
    env,
    user
  );

  const groups =
    await loadGroups(env);

  await sendMessage(
    env,
    peerId,

    "Выбери институт / факультет:",

    facultyKeyboard(
      uniqueFaculties(groups)
    )
  );
}


/* =========================================================
   GROUP SELECTION
========================================================= */

async function handleGroupState(
  env,
  peerId,
  user,
  text
) {
  const groups =
    await loadGroups(env);

  if (
    text === "⬅️ Назад"
  ) {
    user.state = null;

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,
      "Главное меню.",
      mainKeyboard(user)
    );

    return true;
  }

  if (
    user.state === "faculty"
  ) {
    const faculty =
      getFacultyByLabel(
        groups,
        text
      );

    if (!faculty) {
      const maybeGroup =
        findGroup(
          groups,
          text
        );

      if (maybeGroup) {
        user.groupId =
          maybeGroup.id;

        user.groupName =
          maybeGroup.name;

        user.faculty =
          maybeGroup.faculty;

        user.facultyId =
          maybeGroup.facultyId;

        user.course =
          maybeGroup.course;

        user.state = null;

        await saveUser(
          env,
          user
        );

        await sendMessage(
          env,
          peerId,
          `Группа сохранена: ${maybeGroup.name}`,
          mainKeyboard(user)
        );

        return true;
      }

      await sendMessage(
        env,
        peerId,

        "Не нашёл такой вариант. " +
          "Выбери институт / факультет кнопкой ниже.",

        facultyKeyboard(
          uniqueFaculties(groups)
        )
      );

      return true;
    }

    user.state =
      JSON.stringify({
        step: "course",
        faculty,
      });

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,

      `Институт / факультет: ${faculty.label}\n\n` +
        "Выбери курс:",

      courseKeyboard()
    );

    return true;
  }

  if (
  typeof user.state === "string" &&
  user.state.startsWith(
    '{"step":"course"'
  )
) {
  let state = null;

  try {
    state =
      JSON.parse(
        user.state
      );
  } catch {
    state = null;
  }

  if (
    !state?.faculty
  ) {
    user.state = null;

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,
      "Состояние выбора группы сброшено. Начни выбор группы заново.",
      mainKeyboard(user)
    );

    return true;
  }

  const courseMatch =
    text.match(
      /^([1-5]) курс$/
    );

  if (!courseMatch) {
    await sendMessage(
      env,
      peerId,
      "Выбери курс кнопкой ниже.",
      courseKeyboard()
    );

    return true;
  }

  const course =
    Number(
      courseMatch[1]
    );

  const filtered =
    getCourseGroups(
      groups,
      state.faculty,
      course
    );

  if (!filtered.length) {
    await sendMessage(
      env,
      peerId,
      "Для этого курса группы не найдены. Попробуй другой курс.",
      courseKeyboard()
    );

    return true;
  }

  user.state =
    JSON.stringify({
      step: "group",
      faculty:
        state.faculty,
      course,
    });

  await saveUser(
    env,
    user
  );

  await sendMessage(
    env,
    peerId,
    `Курс: ${course}\n\n` +
      "✍️ Напиши название своей группы сообщением.\n\n" +
      "Например: М-1-25",
    groupInputKeyboard()
  );

  return true;
}

 if (
  typeof user.state === "string" &&
  user.state.startsWith(
    '{"step":"group"'
  )
) {
  let state = null;

  try {
    state =
      JSON.parse(
        user.state
      );
  } catch {
    state = null;
  }

  if (
    !state?.faculty ||
    !state?.course
  ) {
    user.state = null;

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,
      "Состояние выбора группы сброшено. Начни выбор группы заново.",
      mainKeyboard(user)
    );

    return true;
  }

  if (
    text === "⬅️ К курсам" ||
    text === "⬅️ Назад"
  ) {
    user.state =
      JSON.stringify({
        step: "course",
        faculty:
          state.faculty,
      });

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,
      "Выбери курс:",
      courseKeyboard()
    );

    return true;
  }

  const filtered =
    getCourseGroups(
      groups,
      state.faculty,
      state.course
    );

  const target =
    normalizeText(
      text
    ).toLowerCase();

  // Ищем группу по названию во всём справочнике: API может
  // отдавать неполные/устаревшие данные курса или факультета.
  const exactMatches =
    groups.filter(
      (group) =>
        normalizeText(group.name).toLowerCase() === target
    );

  const facultyMatches =
    exactMatches.filter((group) => {
      const facultyIdMatch =
        state.faculty.facultyId != null &&
        group.facultyId != null &&
        String(group.facultyId) === String(state.faculty.facultyId);
      const facultyNameMatch =
        normalizeText(group.faculty).toLowerCase() ===
        normalizeText(state.faculty.faculty).toLowerCase();
      return facultyIdMatch || facultyNameMatch;
    });

  const courseMatches =
    facultyMatches.filter(
      (group) => Number(group.course) === Number(state.course)
    );

  // Приоритет: факультет + курс, затем тот же факультет.
  // Если группа уникальна во всём справочнике — не блокируем её
  // из-за ошибочных метаданных API. Неоднозначные совпадения не принимаем.
  const selected =
    courseMatches[0] ||
    facultyMatches[0] ||
    (exactMatches.length === 1 ? exactMatches[0] : null);

  if (!selected) {
    await sendMessage(
      env,
      peerId,
      `❌ Группа «${text}» не найдена для ${state.course} курса.\n\n` +
        "Проверь написание и отправь название группы ещё раз.\n\n" +
        "Например: М-1-25",
      groupInputKeyboard()
    );

    return true;
  }

  user.groupId =
    selected.id;

  user.groupName =
    selected.name;

  user.faculty =
    selected.faculty;

  user.facultyId =
    selected.facultyId;

  user.course =
    selected.course;

  user.state = null;

  await saveUser(
    env,
    user
  );

  await sendMessage(
    env,
    peerId,
    `✅ Группа сохранена: ${selected.name}\n\n` +
      "Теперь она используется для расписания, уведомлений и открытия Mini App.",
    mainKeyboard(user)
  );

  return true;
}

  return false;
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

async function showNotifications(
  env,
  peerId,
  user
) {
  await sendMessage(
    env,
    peerId,

    "🔔 Уведомления\n\n" +
      "Выбери, какие уведомления получать.\n" +
      "Все времена — по Москве.",

    notificationKeyboard(user)
  );
}

async function toggleNotification(
  env,
  peerId,
  user,
  type
) {
  if (type === "daily") {
    user.dailyNotifications =
      !user.dailyNotifications;
  }

  if (type === "reminder") {
    user.reminderNotifications =
      !user.reminderNotifications;
  }

  if (type === "change") {
    user.changeNotifications =
      !user.changeNotifications;
  }

  user.notifications =
    user.dailyNotifications ||
    user.reminderNotifications ||
    user.changeNotifications;

  await saveUser(
    env,
    user
  );

  await sendMessage(
    env,
    peerId,

    "Настройки уведомлений обновлены.",

    notificationKeyboard(user)
  );
}

function notificationKey(
  userId,
  type,
  suffix
) {
  return (
    `sent:${type}:` +
    `${userId}:` +
    `${suffix}`
  );
}


/* =========================================================
   DAILY NOTIFICATIONS
========================================================= */

async function sendDailyNotifications(
  env,
  now = new Date()
) {
  const date =
    isoDateInMoscow(now);

  const users =
    await listUsers(env);

  const byGroup =
    new Map();

  for (const user of users) {
    if (
      !user.groupId ||
      !user.dailyNotifications ||
      user.notifications === false
    ) {
      continue;
    }

    const key =
      String(user.groupId);

    if (!byGroup.has(key)) {
      byGroup.set(
        key,
        []
      );
    }

    byGroup
      .get(key)
      .push(user);
  }

  for (
    const [groupId, groupUsers]
    of byGroup
  ) {
    let lessons;

    try {
      lessons =
        await fetchSchedule(
          Number(groupId),
          date
        );
    } catch (e) {
      console.error(
        "DAILY SCHEDULE ERROR",
        groupId,
        e?.stack || e
      );

      continue;
    }

    for (const user of groupUsers) {
      const key =
        notificationKey(
          user.vkId,
          "daily",
          date
        );

      if (
        await env.KGEU_VK_USERS.get(
          key
        )
      ) {
        continue;
      }

      const text =
        formatScheduleText(
          user.groupName ||
            `ID ${groupId}`,
          date,
          lessons
        );

      try {
        await sendMessage(
          env,
          user.vkId,

          `🌅 Доброе утро!\n\n${text}`,

          mainKeyboard(user)
        );

        await env.KGEU_VK_USERS.put(
          key,
          "1",
          {
            expirationTtl:
              3 * 24 * 60 * 60,
          }
        );
      } catch (e) {
        console.error(
          "DAILY SEND ERROR",
          user.vkId,
          e?.stack || e
        );
      }
    }
  }
}


/* =========================================================
   REMINDERS
========================================================= */

function isReminderDue(diff) {
  // The cron runs every five minutes. Include the full polling interval so
  // every lesson start minute is covered; the KV key below prevents duplicates.
  const earliestMinutes = Math.max(1, REMINDER_MINUTES - CRON_MINUTES);
  return Number.isFinite(diff)
    && diff >= earliestMinutes
    && diff <= REMINDER_MINUTES;
}

async function sendReminders(
  env,
  now = new Date()
) {
  const parts =
    moscowParts(now);

  const today =
    isoDateInMoscow(now);

  const currentMinutes =
    parts.hour * 60 +
    parts.minute;

  const users =
    await listUsers(env);

  const byGroup =
    new Map();

  for (const user of users) {
    if (
      !user.groupId ||
      !user.reminderNotifications ||
      user.notifications === false
    ) {
      continue;
    }

    const key =
      String(user.groupId);

    if (!byGroup.has(key)) {
      byGroup.set(
        key,
        []
      );
    }

    byGroup
      .get(key)
      .push(user);
  }

  for (
    const [groupId, groupUsers]
    of byGroup
  ) {
    let lessons;

    try {
      lessons =
        await fetchSchedule(
          Number(groupId),
          today
        );
    } catch (e) {
      console.error(
        "REMINDER SCHEDULE ERROR",
        groupId,
        e?.stack || e
      );

      continue;
    }

    for (const lesson of lessons) {
      const start =
        timeToMinutes(
          lessonStart(lesson)
        );

      if (start == null) {
        continue;
      }

      const diff =
        start -
        currentMinutes;

      if (!isReminderDue(diff)) {
        continue;
      }

      const code =
        lessonCode(lesson);

      for (const user of groupUsers) {
        const key =
          notificationKey(
            user.vkId,
            "reminder",
            `${today}:${code}`
          );

        if (
          await env.KGEU_VK_USERS.get(
            key
          )
        ) {
          continue;
        }

        try {
          await sendMessage(
            env,
            user.vkId,

            `⏰ Через ${REMINDER_MINUTES} минут занятие\n\n` +
              `${lessonSubject(lesson)}\n` +
              `${lessonStart(lesson)}` +
              `${
                lessonEnd(lesson)
                  ? "–" +
                    lessonEnd(
                      lesson
                    )
                  : ""
              }` +
              `${
                lessonRoom(lesson)
                  ? "\n📍 " +
                    lessonRoom(
                      lesson
                    )
                  : ""
              }` +
              `${
                lessonTeacher(
                  lesson
                )
                  ? "\n👨‍🏫 " +
                    lessonTeacher(
                      lesson
                    )
                  : ""
              }`,

            mainKeyboard(user)
          );

          await env.KGEU_VK_USERS.put(
            key,
            "1",
            {
              expirationTtl:
                24 * 60 * 60,
            }
          );
        } catch (e) {
          console.error(
            "REMINDER SEND ERROR",
            user.vkId,
            e?.stack || e
          );
        }
      }
    }
  }
}


/* =========================================================
   CHANGE NOTIFICATIONS
========================================================= */

async function sendChangeNotifications(
  env,
  now = new Date()
) {
  const date =
    isoDateInMoscow(now);

  const users =
    await listUsers(env);

  const byGroup =
    new Map();

  for (const user of users) {
    if (
      !user.groupId ||
      !user.changeNotifications ||
      user.notifications === false
    ) {
      continue;
    }

    const key =
      String(user.groupId);

    if (!byGroup.has(key)) {
      byGroup.set(
        key,
        []
      );
    }

    byGroup
      .get(key)
      .push(user);
  }

  for (
    const [groupId, groupUsers]
    of byGroup
  ) {
    let lessons;

    try {
      lessons =
        await fetchSchedule(
          Number(groupId),
          date
        );
    } catch (e) {
      console.error(
        "CHANGE SCHEDULE ERROR",
        groupId,
        e?.stack || e
      );

      continue;
    }

    const snapshotKey =
      `snapshot:${groupId}:${date}`;

    const current =
      scheduleSignature(
        lessons
      );

    const previous =
      await env.KGEU_VK_USERS.get(
        snapshotKey
      );

    if (!previous) {
      await env.KGEU_VK_USERS.put(
        snapshotKey,
        current,
        {
          expirationTtl:
            3 * 24 * 60 * 60,
        }
      );

      continue;
    }

    if (
      previous === current
    ) {
      continue;
    }

    await env.KGEU_VK_USERS.put(
      snapshotKey,
      current,
      {
        expirationTtl:
          3 * 24 * 60 * 60,
      }
    );

    for (const user of groupUsers) {
      const key =
        notificationKey(
          user.vkId,
          "change",
          date
        );

      if (
        await env.KGEU_VK_USERS.get(
          key
        )
      ) {
        continue;
      }

      try {
        await sendMessage(
          env,
          user.vkId,

          `🔄 В расписании группы ${
            user.groupName ||
            groupId
          } обнаружены изменения.\n\n` +
            "Открой Mini App, чтобы посмотреть актуальное расписание.",

          mainKeyboard(user)
        );

        await env.KGEU_VK_USERS.put(
          key,
          "1",
          {
            expirationTtl:
              24 * 60 * 60,
          }
        );
      } catch (e) {
        console.error(
          "CHANGE SEND ERROR",
          user.vkId,
          e?.stack || e
        );
      }
    }
  }
}


/* =========================================================
   USER LIST
========================================================= */

async function listUsers(env) {
  if (!env.KGEU_VK_USERS) {
    throw new Error(
      "KV binding KGEU_VK_USERS is missing"
    );
  }

  const users = [];

  let cursor;

  do {
    const page =
      await env.KGEU_VK_USERS.list({
        prefix:
          USER_PREFIX,
        cursor,
      });

    for (
      const item of page.keys
    ) {
      if (
        !item.name.startsWith(
          USER_PREFIX
        )
      ) {
        continue;
      }

      try {
        const user =
          await env.KGEU_VK_USERS.get(
            item.name,
            "json"
          );

        if (user?.vkId) {
          users.push(user);
        }
      } catch (e) {
        console.error(
          "LIST USER PARSE ERROR",
          item.name,
          e?.stack || e
        );
      }
    }

    cursor =
      page.list_complete
        ? undefined
        : page.cursor;

  } while (cursor);

  return users;
}


/* =========================================================
   CRON
========================================================= */

async function runCron(env) {
  const now =
    new Date();

  const parts =
    moscowParts(now);

  console.log(
    "CRON RUN:",
    JSON.stringify(parts)
  );

  if (
    parts.hour === DAILY_HOUR &&
    parts.minute < CRON_MINUTES
  ) {
    await sendDailyNotifications(
      env,
      now
    );
  }

  await sendReminders(
    env,
    now
  );

  await sendChangeNotifications(
    env,
    now
  );
}


/* =========================================================
   VK CALLBACK MESSAGE EXTRACTION
   КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ
========================================================= */

function extractMessage(update) {
  return (
    update?.object?.message ??
    update?.object?.object?.message ??
    update?.object?.object ??
    update?.object ??
    null
  );
}


/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessageNew(
  env,
  msg
) {
  // Дополнительная защита на случай
  // ещё одного уровня вложенности.
  msg =
    msg?.message ??
    msg;

  if (
    !msg ||
    !msg.from_id
  ) {
    throw new Error(
      "message_new object has no from_id: " +
        JSON.stringify(msg)
    );
  }

  console.log(
    "HANDLE MESSAGE:",
    JSON.stringify({
      from_id:
        msg.from_id,
      peer_id:
        msg.peer_id,
      text:
        msg.text,
    })
  );

  const user =
    await ensureUser(
      env,
      msg
    );

  const peerId =
    msg.peer_id ||
    msg.from_id;

  const text =
    normalizeText(
      msg.text || ""
    );

  if (!text) {
    await sendStart(
      env,
      peerId,
      user
    );

    return;
  }

  /*
   * Сначала обрабатываем состояние выбора группы.
   */
  if (user.state) {
    const handled =
      await handleGroupState(
        env,
        peerId,
        user,
        text
      );

    if (handled) {
      return;
    }
  }

  /*
   * START
   */
  if (
    text === "Начать" ||
    text === "/start" ||
    text === "start" ||
    text === "привет"
  ) {
    await sendStart(
      env,
      peerId,
      user
    );

    return;
  }

  /*
   * РАСПИСАНИЕ
   */
  if (
    text === "📅 Расписание" ||
    text.toLowerCase() ===
      "расписание"
  ) {
    try {
      await sendCurrentSchedule(
        env,
        peerId,
        user
      );
    } catch (e) {
      console.error(
        "SCHEDULE MESSAGE ERROR:",
        e?.stack || e
      );

      try {
        await sendMessage(
          env,
          peerId,

          "Не удалось загрузить расписание. " +
            "Попробуй ещё раз через минуту.",

          mainKeyboard(user)
        );
      } catch (sendError) {
        console.error(
          "SCHEDULE ERROR MESSAGE SEND FAILED:",
          sendError?.stack ||
            sendError
        );
      }
    }

    return;
  }

  /*
   * СМЕНИТЬ ГРУППУ
   */
  if (
    text ===
      "👥 Сменить группу" ||
    text.toLowerCase() ===
      "группа"
  ) {
    await startGroupSelection(
      env,
      peerId,
      user
    );

    return;
  }

  /*
   * УВЕДОМЛЕНИЯ
   */
  if (
    text ===
      "🔔 Уведомления" ||
    text.toLowerCase() ===
      "уведомления"
  ) {
    await showNotifications(
      env,
      peerId,
      user
    );

    return;
  }

  /*
   * DAILY 07:00
   */
  if (
    text.startsWith(
      "✅ 07:00"
    ) ||
    text.startsWith(
      "⬜ 07:00"
    )
  ) {
    await toggleNotification(
      env,
      peerId,
      user,
      "daily"
    );

    return;
  }

  /*
   * REMINDER
   */
  if (
    text.startsWith(
      "✅ За 15 минут"
    ) ||
    text.startsWith(
      "⬜ За 15 минут"
    )
  ) {
    await toggleNotification(
      env,
      peerId,
      user,
      "reminder"
    );

    return;
  }

  /*
   * CHANGES
   */
  if (
    text.startsWith(
      "✅ Изменения"
    ) ||
    text.startsWith(
      "⬜ Изменения"
    )
  ) {
    await toggleNotification(
      env,
      peerId,
      user,
      "change"
    );

    return;
  }

  /*
   * HELP
   */
  if (
    text === "ℹ️ Помощь" ||
    text.toLowerCase() ===
      "помощь"
  ) {
    await sendHelp(
      env,
      peerId,
      user
    );

    return;
  }

  /*
   * BACK
   */
  if (
    text === "⬅️ Назад"
  ) {
    user.state = null;

    await saveUser(
      env,
      user
    );

    await sendMessage(
      env,
      peerId,
      "Главное меню.",
      mainKeyboard(user)
    );

    return;
  }

  /*
   * Можно отправить название группы
   * напрямую, например М-1-25.
   */
  try {
    const groups =
      await loadGroups(env);

    const direct =
      findGroup(
        groups,
        text
      );

    if (
      direct &&
      (
        !user.groupId ||
        direct.name !==
          user.groupName
      )
    ) {
      user.groupId =
        direct.id;

      user.groupName =
        direct.name;

      user.faculty =
        direct.faculty;

      user.facultyId =
        direct.facultyId;

      user.course =
        direct.course;

      user.state = null;

      await saveUser(
        env,
        user
      );

      await sendMessage(
        env,
        peerId,

        `✅ Группа сохранена: ${direct.name}`,

        mainKeyboard(user)
      );

      return;
    }
  } catch (e) {
    console.error(
      "DIRECT GROUP SEARCH ERROR:",
      e?.stack || e
    );
  }

  /*
   * Если группа уже выбрана —
   * показываем главное меню.
   */
  if (user.groupId) {
    await sendMessage(
      env,
      peerId,

      "Не понял команду. Используй кнопки ниже.",

      mainKeyboard(user)
    );
  } else {
    await sendStart(
      env,
      peerId,
      user
    );
  }
}


/* =========================================================
   CALLBACK API
========================================================= */

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    /*
     * GET — проверка Worker в браузере.
     */
    if (
      request.method ===
      "GET"
    ) {
      return new Response(
        "KGEU VK Bot is running",
        {
          status: 200,
        }
      );
    }

    /*
     * Только POST от VK Callback API.
     */
    if (
      request.method !==
      "POST"
    ) {
      return new Response(
        "Method Not Allowed",
        {
          status: 405,
        }
      );
    }

    let update;

    try {
      update =
        await request.json();
    } catch (e) {
      console.error(
        "CALLBACK JSON ERROR:",
        e?.stack || e
      );

      return new Response(
        "bad json",
        {
          status: 400,
        }
      );
    }

    /*
     * Логируем тип события.
     * Не логируем VK_TOKEN.
     */
    console.log(
      "VK CALLBACK EVENT:",
      update?.type
    );

    /*
     * CONFIRMATION
     *
     * В VK Callback API должен быть:
     * 907c494e
     */
    if (
      update?.type ===
      "confirmation"
    ) {
      console.log(
        "VK CALLBACK CONFIRMATION"
      );

      return new Response(
        env.CONFIRMATION_CODE ||
          "907c494e",
        {
          status: 200,
        }
      );
    }

    /*
     * MESSAGE_NEW
     *
     * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ:
     *
     * сообщение может находиться:
     *
     * update.object.message
     *
     * либо в другой вложенной структуре.
     */
    if (
      update?.type ===
      "message_new"
    ) {
      console.log(
        "MESSAGE_NEW PAYLOAD KEYS:",
        Object.keys(
          update?.object || {}
        )
      );

      const msg =
        extractMessage(
          update
        );

      console.log(
        "MESSAGE_NEW RECEIVED:",
        JSON.stringify(msg)
      );

      /*
       * VK должен получить 200 OK максимально быстро.
       *
       * Саму обработку сообщения
       * выполняем через waitUntil().
       */
      ctx.waitUntil(
        handleMessageNew(
          env,
          msg
        ).catch((e) => {
          console.error(
            "MESSAGE_NEW ERROR STACK:",
            e?.stack || e
          );
        })
      );

      return new Response(
        "ok",
        {
          status: 200,
        }
      );
    }

    /*
     * Другие события просто подтверждаем.
     */
    return new Response(
      "ok",
      {
        status: 200,
      }
    );
  },

  /*
   * Cloudflare Cron.
   */
  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      runCron(env).catch(
        (e) => {
          console.error(
            "CRON ERROR STACK:",
            e?.stack || e
          );
        }
      )
    );
  },
};
--a4805b0429f252692e25e0c1af1b1be3aad59de166f1607367ddfa83410e