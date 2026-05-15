// ── Telegram Bot config ──────────────────────────────────────────────────────
// 1. @BotFather → /newbot → copy TOKEN
// 2. Add bot to your group or chat → send a message → run:
//    https://api.telegram.org/bot<TOKEN>/getUpdates  → find "chat":{"id":...}
// 3. Paste TOKEN and CHAT_ID below.
const TG_TOKEN = "8737173929:AAHM9pc_WYHq8cB5b2CuzM3SwVegnRkav8w";
const TG_CHAT  = "702975619";

async function sendToTelegram(text) {
  if (TG_TOKEN === "PASTE_BOT_TOKEN_HERE") {
    console.warn("[forms] Telegram not configured. Would have sent:", text);
    return { ok: true, _stub: true };
  }
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML" }),
  });
  return res.json();
}

// ── Phone mask ───────────────────────────────────────────────────────────────
function applyPhoneMask(input) {
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "");
    if (v.startsWith("8")) v = "7" + v.slice(1);
    if (v.startsWith("7")) {
      const m = v.match(/^7(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/);
      if (m) {
        input.value = [
          "+7",
          m[1] ? ` (${m[1]}`  : "",
          m[2] ? `) ${m[2]}`  : "",
          m[3] ? `-${m[3]}`   : "",
          m[4] ? `-${m[4]}`   : "",
        ].join("").trim();
      }
    } else {
      input.value = v.length ? `+${v}` : "";
    }
  });
}

function setStatus(el, msg, ok) {
  el.textContent = msg;
  el.classList.remove("hidden", "text-red-400", "text-emerald-400");
  el.classList.add(ok ? "text-emerald-400" : "text-red-400");
}

// ── Form 1: callback ─────────────────────────────────────────────────────────
(function initCallback() {
  const form   = document.getElementById("form-callback");
  const phone  = document.getElementById("cb-phone");
  const status = document.getElementById("cb-status");
  const btn    = form?.querySelector("button[type=submit]");
  if (!form) return;

  applyPhoneMask(phone);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    phone.classList.remove("is-invalid");

    const raw = phone.value.replace(/\D/g, "");
    if (raw.length < 10) {
      phone.classList.add("is-invalid");
      setStatus(status, "Укажите корректный номер телефона.", false);
      status.classList.remove("hidden");
      phone.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "Отправляем...";

    const text = `📞 <b>Запрос на обратный звонок</b>\n\nТелефон: <code>${phone.value}</code>`;
    try {
      const data = await sendToTelegram(text);
      if (data.ok) {
        setStatus(status, "Готово. Перезвоним в течение 20 минут.", true);
        form.reset();
      } else {
        throw new Error(data.description || "Telegram error");
      }
    } catch (err) {
      setStatus(status, "Не удалось отправить. Попробуйте позже.", false);
      console.error("[forms] callback error:", err);
    }

    status.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = 'Перезвоните мне <span aria-hidden="true">[→]</span>';
  });
})();

// ── Form 2: brief ────────────────────────────────────────────────────────────
(function initBrief() {
  const form    = document.getElementById("form-brief");
  const object  = document.getElementById("br-object");
  const lod     = document.getElementById("br-lod");
  const goal    = document.getElementById("br-goal");
  const contact = document.getElementById("br-contact");
  const status  = document.getElementById("br-status");
  const btn     = form?.querySelector("button[type=submit]");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    contact.classList.remove("is-invalid");

    if (!contact.value.trim()) {
      contact.classList.add("is-invalid");
      setStatus(status, "Укажите телефон или e-mail для связи.", false);
      status.classList.remove("hidden");
      contact.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "Отправляем...";

    const lines = [
      `📋 <b>Бриф на проект</b>`,
      ``,
      object.value  ? `Тип объекта: ${object.value}`  : null,
      lod.value     ? `Целевой LOD: ${lod.value}`      : null,
      goal.value    ? `Задача: ${goal.value}`           : null,
      `Контакт: <code>${contact.value}</code>`,
    ].filter(Boolean).join("\n");

    try {
      const data = await sendToTelegram(lines);
      if (data.ok) {
        setStatus(status, "Бриф отправлен. Подготовим предложение в течение рабочего дня.", true);
        form.reset();
      } else {
        throw new Error(data.description || "Telegram error");
      }
    } catch (err) {
      setStatus(status, "Не удалось отправить. Попробуйте позже.", false);
      console.error("[forms] brief error:", err);
    }

    status.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = 'Отправить бриф <span aria-hidden="true">[→]</span>';
  });
})();
