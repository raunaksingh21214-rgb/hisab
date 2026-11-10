// Hisab — Personal Expense & Debt Ledger
// Comprehensive Money Tracker with WhatsApp & SMS Reminders

const STORAGE_KEY = "hisab-ledger-v2";
const LEGACY_KEY = "hisab-ledger-v1";
const PROFILES_KEY = "hisab-profiles-v1";
const STORAGE_PREFIX = "hisab-profile-data-";

const defaultSettings = () => ({
  yourName: "",
  currency: "₹",
  countryCode: "91",
  upiId: "",
  theme: "light",
  whatsappMode: "app_direct", // "direct_greenapi" | "direct_ultramsg" | "direct_custom" | "app_direct"
  greenApiInstance: "",
  greenApiToken: "",
  ultraMsgInstance: "",
  ultraMsgToken: "",
  customWhatsappWebhook: "",
  smsMode: "device", // "device" | "fast2sms" | "twilio"
  fast2smsApiKey: "",
  twilioSid: "",
  twilioToken: "",
  twilioFrom: "",
});

function defaultProfiles() {
  return {
    activeProfileId: "default",
    profiles: [
      {
        id: "default",
        name: "Personal Ledger",
        icon: "👤",
        pin: null,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

let profileState = loadProfilesState();
let pendingSwitchProfileId = null;

function loadProfilesState() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) {
      const def = defaultProfiles();
      localStorage.setItem(PROFILES_KEY, JSON.stringify(def));
      return def;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.profiles) || !parsed.activeProfileId) {
      return defaultProfiles();
    }
    return parsed;
  } catch {
    return defaultProfiles();
  }
}

function saveProfilesState() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profileState));
  } catch (err) {
    console.warn("Could not save profile state", err);
  }
}

function getActiveProfile() {
  return profileState.profiles.find((p) => p.id === profileState.activeProfileId) || profileState.profiles[0];
}

function getProfileStorageKey(profileId) {
  return `${STORAGE_PREFIX}${profileId}`;
}

let state = loadInitialState();
let activeTab = "tab-people";
let peopleFilter = "all";
let peopleQuery = "";
let feedFilter = "all";
let feedCategory = "all";
let feedQuery = "";

let editingPersonId = null;
let currentEntryContext = { personId: null, entryId: null };
let historyPersonId = null;
let remindPersonId = null;
let currentRemindTemplate = "casual";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Generate unique ID
function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Load state with migration support from v1 & v2 into active profile
function loadInitialState() {
  const currentProfile = getActiveProfile();
  const profileKey = getProfileStorageKey(currentProfile.id);

  try {
    const raw = localStorage.getItem(profileKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        settings: { ...defaultSettings(), ...parsed.settings },
        people: Array.isArray(parsed.people) ? parsed.people : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    }

    // Migration for default profile
    if (currentProfile.id === "default") {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        const data = {
          settings: { ...defaultSettings(), ...parsed.settings },
          people: Array.isArray(parsed.people) ? parsed.people : [],
          entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        };
        localStorage.setItem(profileKey, JSON.stringify(data));
        return data;
      }

      const rawV1 = localStorage.getItem(LEGACY_KEY);
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1);
        const migrated = {
          settings: { ...defaultSettings(), ...parsedV1.settings },
          people: Array.isArray(parsedV1.people)
            ? parsedV1.people.map((p) => ({
                id: p.id || uid(),
                name: p.name || "Unknown",
                phone: p.phone || "",
                notes: "",
                lastReminded: null,
                createdAt: p.createdAt || new Date().toISOString(),
              }))
            : [],
          entries: Array.isArray(parsedV1.entries)
            ? parsedV1.entries.map((e) => ({
                id: e.id || uid(),
                personId: e.personId,
                direction: e.direction || "gave",
                amount: Number(e.amount) || 0,
                category: "🏷️ Other",
                paymentMethod: "UPI / Online",
                date: e.date || new Date().toISOString().slice(0, 10),
                note: e.note || "",
                createdAt: e.createdAt || new Date().toISOString(),
              }))
            : [],
        };
        localStorage.setItem(profileKey, JSON.stringify(migrated));
        return migrated;
      }
    }

    const initial = { settings: defaultSettings(), people: [], entries: [] };
    localStorage.setItem(profileKey, JSON.stringify(initial));
    return initial;
  } catch (err) {
    console.error("Storage error:", err);
    return { settings: defaultSettings(), people: [], entries: [] };
  }
}

function saveState() {
  try {
    const currentProfile = getActiveProfile();
    const profileKey = getProfileStorageKey(currentProfile.id);
    localStorage.setItem(profileKey, JSON.stringify(state));
    if (currentProfile.id === "default") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (err) {
    showToast("Storage quota exceeded or saving failed");
  }
}

// Formatting helpers
function formatMoney(amount, showSign = false) {
  const absVal = Math.abs(amount || 0);
  const formatted = absVal.toLocaleString("en-IN", {
    minimumFractionDigits: absVal % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const prefix = showSign ? (amount > 0 ? "+" : amount < 0 ? "−" : "") : "";
  return `${prefix}${state.settings.currency}${formatted}`;
}

function cleanDigits(val) {
  return String(val || "").replace(/\D/g, "");
}

function getInternationalPhone(person) {
  const digits = cleanDigits(person.phone);
  if (!digits) return "";
  const code = cleanDigits(state.settings.countryCode) || "91";
  if (digits.startsWith(code) && digits.length > 10) return digits;
  if (digits.length <= 10) return `${code}${digits}`;
  return digits;
}

function getAvatarColor(name) {
  const colors = [
    "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    "linear-gradient(135deg, #10b981, #047857)",
    "linear-gradient(135deg, #f59e0b, #b45309)",
    "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    "linear-gradient(135deg, #ec4899, #be185d)",
    "linear-gradient(135deg, #06b6d4, #0e7490)",
  ];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash += name.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTodayString() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

// Financial calculations
function calculatePersonBalance(personId) {
  return state.entries.reduce((total, entry) => {
    if (entry.personId !== personId) return total;
    return total + (entry.direction === "gave" ? entry.amount : -entry.amount);
  }, 0);
}

function getTotals() {
  let toReceive = 0;
  let toPay = 0;

  state.people.forEach((person) => {
    const bal = calculatePersonBalance(person.id);
    if (bal > 0.009) toReceive += bal;
    else if (bal < -0.009) toPay += Math.abs(bal);
  });

  const net = toReceive - toPay;
  return { toReceive, toPay, net };
}

// Toast notification
function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

// Theme handling
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  state.settings.theme = theme;
  saveState();
}

function initTheme() {
  const currentTheme = state.settings.theme || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
}

// Main Render Function
function renderAll() {
  renderSummary();
  renderPeopleList();
  renderActivityFeed();
  renderAnalytics();
  updateCounts();
}

function updateCounts() {
  $("#people-count").textContent = state.people.length;
  $("#entries-count").textContent = state.entries.length;
  $$(".currency-label").forEach((el) => (el.textContent = state.settings.currency));
  $("#phone-prefix-display").textContent = `+${cleanDigits(state.settings.countryCode) || "91"}`;
}

// Render Summary Cards
function renderSummary() {
  const { toReceive, toPay, net } = getTotals();
  $("#total-receive").textContent = formatMoney(toReceive);
  $("#total-pay").textContent = formatMoney(toPay);
  $("#total-net").textContent = formatMoney(net);

  const netCaption = $("#net-caption");
  if (net > 0.009) {
    netCaption.textContent = "Net in your favour (+)";
    netCaption.style.color = "var(--color-receive)";
  } else if (net < -0.009) {
    netCaption.textContent = "You owe overall (−)";
    netCaption.style.color = "var(--color-pay)";
  } else {
    netCaption.textContent = "All settled up (0 balance)";
    netCaption.style.color = "var(--text-muted)";
  }
}

// TAB 1: Render People & Balances
function renderPeopleList() {
  const listEl = $("#people-list");

  const peopleWithBalances = state.people.map((person) => {
    const balance = calculatePersonBalance(person.id);
    return { ...person, balance };
  });

  const filtered = peopleWithBalances.filter((person) => {
    const searchHaystack = `${person.name} ${person.phone} ${person.notes || ""}`.toLowerCase();
    if (peopleQuery && !searchHaystack.includes(peopleQuery)) return false;

    if (peopleFilter === "receive") return person.balance > 0.009;
    if (peopleFilter === "pay") return person.balance < -0.009;
    if (peopleFilter === "settled") return Math.abs(person.balance) <= 0.009;
    return true;
  });

  // Sort: highest pending balance first
  filtered.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));

  if (!state.people.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <h3>No contacts added yet</h3>
        <p>Add friends, flatmates, or colleagues to keep track of money given, taken, or split.</p>
        <button type="button" class="btn btn-primary" onclick="$('#btn-add-person').click()">+ Add First Contact</button>
      </div>`;
    return;
  }

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>No matching contacts</h3>
        <p>No contacts found matching your current search or filter criteria.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((person) => {
      const balance = person.balance;
      let statusClass = "settled";
      let statusLabel = "Settled Up";

      if (balance > 0.009) {
        statusClass = "receive";
        statusLabel = "They owe you";
      } else if (balance < -0.009) {
        statusClass = "pay";
        statusLabel = "You owe them";
      }

      const displayPhone = person.phone || "No phone number";
      const hasPhone = Boolean(cleanDigits(person.phone));
      const initials = getInitials(person.name);
      const avatarStyle = `background: ${getAvatarColor(person.name)}`;
      const noteBadge = person.notes ? `<span class="person-note-tag">${escapeHtml(person.notes)}</span>` : "";

      const remindedBadge = person.lastReminded
        ? `<span class="reminded-status" title="Last reminded: ${new Date(person.lastReminded).toLocaleString()}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Reminded ${formatRelativeTime(person.lastReminded)}
          </span>`
        : "";

      return `
        <article class="person-card" data-person-id="${person.id}">
          <div class="person-card-top">
            <div class="person-identity">
              <div class="avatar-circle" style="${avatarStyle}">${initials}</div>
              <div>
                <h3>${escapeHtml(person.name)}</h3>
                <p class="person-phone">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  ${escapeHtml(displayPhone)}
                </p>
                ${noteBadge}
              </div>
            </div>

            <div class="person-balance-box ${statusClass}">
              <strong class="person-balance-amt">${formatMoney(balance)}</strong>
              <span class="person-balance-label">${statusLabel}</span>
              ${remindedBadge}
            </div>
          </div>

          <div class="person-actions">
            <button type="button" class="btn btn-sm btn-receive" data-action="gave" title="You gave money (increases what they owe you)">+ Gave</button>
            <button type="button" class="btn btn-sm btn-pay" data-action="got" title="You received money or borrowed from them">− Got</button>
            ${
              Math.abs(balance) > 0.009
                ? `<button type="button" class="btn btn-sm btn-outline" data-action="settle" title="Clear balance in 1 click">Settle</button>
                   <button type="button" class="btn btn-sm ${hasPhone ? "btn-whatsapp" : "btn-secondary"}" data-action="remind" title="Send WhatsApp or SMS reminder">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                     Remind
                   </button>`
                : ""
            }
            <button type="button" class="btn btn-sm btn-secondary" data-action="history" title="View all transactions & statement">History</button>
          </div>
        </article>`;
    })
    .join("");
}

// TAB 2: Render Expense & Activity Feed
function renderActivityFeed() {
  const feedEl = $("#activity-feed");

  // Enrich entries with person details
  const enrichedEntries = state.entries
    .map((entry) => {
      const person = state.people.find((p) => p.id === entry.personId) || { name: "Unknown Contact" };
      return { ...entry, personName: person.name };
    })
    .filter((entry) => {
      // Type filter
      if (feedFilter !== "all" && entry.direction !== feedFilter) return false;
      // Category filter
      if (feedCategory !== "all" && entry.category !== feedCategory) return false;
      // Query filter
      if (feedQuery) {
        const text = `${entry.personName} ${entry.note || ""} ${entry.category || ""}`.toLowerCase();
        if (!text.includes(feedQuery)) return false;
      }
      return true;
    });

  // Sort descending by date and creation
  enrichedEntries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

  if (!state.entries.length) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <h3>No transactions recorded yet</h3>
        <p>Use the "+ Add Transaction" button above to log an expense or loan.</p>
        <button type="button" class="btn btn-primary" onclick="$('#btn-quick-entry').click()">+ Add Transaction</button>
      </div>`;
    return;
  }

  if (!enrichedEntries.length) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <h3>No matching transactions</h3>
        <p>Try clearing your category or search query.</p>
      </div>`;
    return;
  }

  feedEl.innerHTML = enrichedEntries
    .map((entry) => {
      const isGave = entry.direction === "gave";
      const icon = (entry.category || "🏷️").split(" ")[0] || "🏷️";
      const sign = isGave ? "+" : "−";
      const amountClass = isGave ? "gave" : "got";
      const badgeText = isGave ? "You Gave" : "You Got";

      return `
        <article class="feed-item" data-entry-id="${entry.id}">
          <div class="feed-left">
            <div class="category-icon-box" title="${escapeHtml(entry.category || 'General')}">${icon}</div>
            <div class="feed-details">
              <h4>${escapeHtml(entry.note || entry.category || "Transaction")}</h4>
              <div class="feed-meta">
                <strong>${escapeHtml(entry.personName)}</strong>
                <span>•</span>
                <span>${entry.date || "Today"}</span>
                <span class="feed-meta-badge">${escapeHtml(entry.paymentMethod || "UPI")}</span>
                <span class="feed-meta-badge">${badgeText}</span>
              </div>
            </div>
          </div>

          <div class="feed-right">
            <div class="feed-amount ${amountClass}">${sign}${formatMoney(entry.amount)}</div>
            <div class="feed-actions">
              <button type="button" data-edit-entry="${entry.id}" title="Edit this entry">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" class="delete" data-delete-entry="${entry.id}" title="Delete this entry">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

// TAB 3: Render Analytics & Breakdown
function renderAnalytics() {
  const barsEl = $("#category-bars");
  const topListEl = $("#top-borrowers");

  // Category breakdown
  const categoryTotals = {};
  let totalVolume = 0;

  state.entries.forEach((e) => {
    const cat = e.category || "🏷️ Other";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
    totalVolume += e.amount;
  });

  const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  if (!sortedCats.length) {
    barsEl.innerHTML = `<p class="hint">No spending data yet.</p>`;
  } else {
    barsEl.innerHTML = sortedCats
      .map(([cat, amount]) => {
        const percent = totalVolume > 0 ? Math.round((amount / totalVolume) * 100) : 0;
        return `
          <div class="bar-row">
            <div class="bar-header">
              <span>${escapeHtml(cat)}</span>
              <span><strong>${formatMoney(amount)}</strong> (${percent}%)</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${percent}%;"></div>
            </div>
          </div>`;
      })
      .join("");
  }

  // Top pending balances (who owes you the most)
  const pendingBorrowers = state.people
    .map((p) => ({ ...p, balance: calculatePersonBalance(p.id) }))
    .filter((p) => p.balance > 0.009)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  if (!pendingBorrowers.length) {
    topListEl.innerHTML = `<p class="hint">No pending dues to collect from anyone.</p>`;
  } else {
    topListEl.innerHTML = pendingBorrowers
      .map(
        (p) => `
        <div class="top-item">
          <div class="top-item-name">${escapeHtml(p.name)}</div>
          <div class="top-item-amt">${formatMoney(p.balance)}</div>
        </div>`
      )
      .join("");
  }
}

// Dialog Helpers
function openModal(dialog) {
  if (dialog && !dialog.open) {
    dialog.showModal();
  }
}

function closeModal(dialog) {
  if (dialog && dialog.open) {
    dialog.close();
  }
}

// Person Dialog Open
function openPersonDialog(person = null) {
  editingPersonId = person ? person.id : null;
  $("#person-title").textContent = person ? "Edit Contact" : "Add Contact";
  const form = $("#person-form");
  form.name.value = person ? person.name : "";
  form.phone.value = person ? person.phone : "";
  form.notes.value = person ? person.notes || "" : "";
  openModal($("#person-dialog"));
  form.name.focus();
}

// Entry Dialog Open
function openEntryDialog(personId = null, forcedDirection = "gave", entry = null) {
  if (!state.people.length) {
    showToast("Please add at least one contact first");
    openPersonDialog();
    return;
  }

  currentEntryContext = {
    personId: personId || state.people[0].id,
    entryId: entry ? entry.id : null,
  };

  const form = $("#entry-form");
  $("#entry-title").textContent = entry ? "Edit Transaction" : "Record Transaction";

  // Populate person dropdown
  const select = $("#entry-person-select");
  select.innerHTML = state.people
    .map(
      (p) => `
      <option value="${p.id}" ${p.id === currentEntryContext.personId ? "selected" : ""}>
        ${escapeHtml(p.name)}
      </option>`
    )
    .join("");

  const dirVal = entry ? entry.direction : forcedDirection;
  const targetRadio = form.querySelector(`input[name="direction"][value="${dirVal}"]`);
  if (targetRadio) targetRadio.checked = true;
  form.amount.value = entry ? entry.amount : "";
  form.date.value = entry ? entry.date : getTodayString();
  form.category.value = entry ? entry.category : "🍔 Food & Drinks";
  form.paymentMethod.value = entry ? entry.paymentMethod || "UPI / Online" : "UPI / Online";
  form.note.value = entry ? entry.note || "" : "";

  openModal($("#entry-dialog"));
  if (!entry) form.amount.focus();
}

// Contact History & Statement Modal
function openHistoryDialog(personId) {
  historyPersonId = personId;
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;

  const balance = calculatePersonBalance(person.id);
  $("#history-name").textContent = person.name;

  const badgeEl = $("#history-balance-badge");
  if (balance > 0.009) {
    badgeEl.textContent = `Pending to collect: ${formatMoney(balance)}`;
    badgeEl.style.color = "var(--color-receive)";
  } else if (balance < -0.009) {
    badgeEl.textContent = `You have to give: ${formatMoney(balance)}`;
    badgeEl.style.color = "var(--color-pay)";
  } else {
    badgeEl.textContent = `Account is settled (0.00)`;
    badgeEl.style.color = "var(--color-settled)";
  }

  const entries = state.entries
    .filter((e) => e.personId === personId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

  const listEl = $("#history-entries-list");
  if (!entries.length) {
    listEl.innerHTML = `<li class="history-item"><p class="hint">No transactions recorded with ${escapeHtml(person.name)} yet.</p></li>`;
  } else {
    listEl.innerHTML = entries
      .map((e) => {
        const isGave = e.direction === "gave";
        const sign = isGave ? "+" : "−";
        return `
          <li class="history-item">
            <div class="history-item-left">
              <h5>${escapeHtml(e.note || e.category || "Transaction")}</h5>
              <div class="history-item-meta">
                <span>${e.date}</span> • <span>${escapeHtml(e.category)}</span> • <span>${escapeHtml(e.paymentMethod || "Cash")}</span>
              </div>
            </div>
            <div class="history-item-right">
              <span class="history-item-amt ${isGave ? "gave" : "got"}">${sign}${formatMoney(e.amount)}</span>
              <div class="feed-actions">
                <button type="button" data-edit-entry="${e.id}" title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button" class="delete" data-delete-entry="${e.id}" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </li>`;
      })
      .join("");
  }

  openModal($("#history-dialog"));
}

// Print Statement generator
function printStatementForPerson(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;

  const entries = state.entries
    .filter((e) => e.personId === personId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const balance = calculatePersonBalance(personId);
  const printEl = $("#print-statement");

  const rows = entries
    .map(
      (e, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${e.date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(e.note || e.category)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${e.direction === 'gave' ? '#059669' : '#333'};">
          ${e.direction === 'gave' ? formatMoney(e.amount) : '—'}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${e.direction === 'got' ? '#dc2626' : '#333'};">
          ${e.direction === 'got' ? formatMoney(e.amount) : '—'}
        </td>
      </tr>`
    )
    .join("");

  printEl.innerHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #111;">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 14px; margin-bottom: 20px;">
        <div>
          <h1 style="margin: 0; font-size: 24px;">Hisab Account Statement</h1>
          <p style="margin: 4px 0 0; color: #666;">Contact: <strong>${escapeHtml(person.name)}</strong> (${escapeHtml(person.phone || "No phone")})</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 13px; color: #666;">Generated on: ${new Date().toLocaleDateString()}</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #666;">From: ${escapeHtml(state.settings.yourName || "Account Holder")}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <thead>
          <tr style="background: #f4f4f4; text-align: left;">
            <th style="padding: 8px; border-bottom: 2px solid #bbb;">#</th>
            <th style="padding: 8px; border-bottom: 2px solid #bbb;">Date</th>
            <th style="padding: 8px; border-bottom: 2px solid #bbb;">Description</th>
            <th style="padding: 8px; border-bottom: 2px solid #bbb; text-align: right;">Gave (+)</th>
            <th style="padding: 8px; border-bottom: 2px solid #bbb; text-align: right;">Got (−)</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="padding: 16px; text-align: center;">No transactions found.</td></tr>'}
        </tbody>
      </table>

      <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: right; font-size: 16px;">
        <span>Final Net Balance: </span>
        <strong style="font-size: 20px; color: ${balance > 0 ? '#059669' : balance < 0 ? '#dc2626' : '#333'};">
          ${formatMoney(balance)}
        </strong>
        <p style="margin: 4px 0 0; font-size: 13px; color: #666;">
          ${balance > 0 ? "Pending amount to be paid to you." : balance < 0 ? "Amount you need to pay." : "Account is completely settled."}
        </p>
      </div>
    </div>`;

  window.print();
}

// Generate Reminder Text based on template
function buildReminderMessage(person, templateStyle = "casual") {
  const balance = calculatePersonBalance(person.id);
  const formattedAmt = formatMoney(balance);
  const personName = person.name.split(" ")[0]; // First name
  const senderName = state.settings.yourName.trim();
  const fromTag = senderName ? ` (${senderName})` : "";
  const upiId = (state.settings.upiId || "").trim();

  let message = "";

  if (balance > 0.009) {
    if (templateStyle === "casual") {
      message = `Hey ${personName}! Quick friendly reminder about ${formattedAmt} pending with you. Whenever you get a moment, please send it over. Thanks! 🙌${fromTag}`;
    } else if (templateStyle === "polite") {
      message = `Dear ${person.name}, this is a gentle reminder regarding the outstanding balance of ${formattedAmt}. Kindly settle this when convenient. Regards${fromTag}.`;
    } else if (templateStyle === "urgent") {
      message = `Hi ${personName}, please settle the pending dues of ${formattedAmt} today if possible. Thank you${fromTag}!`;
    } else if (templateStyle === "itemized") {
      const recent = state.entries
        .filter((e) => e.personId === person.id && e.direction === "gave")
        .slice(0, 3)
        .map((e) => `• ${formatMoney(e.amount)} (${e.note || e.category})`)
        .join("\n");

      message = `Hi ${personName}, your total pending balance is ${formattedAmt}.\n${recent ? `Recent items:\n${recent}\n` : ""}Please transfer when you can. Thank you${fromTag}!`;
    }

    if (upiId) {
      message += `\n\n⚡ Pay directly via UPI: ${upiId}`;
    }
  } else if (balance < -0.009) {
    message = `Hi ${personName}, just keeping you posted that I have to give you ${formattedAmt}. I will settle it with you shortly!${fromTag}`;
  } else {
    message = `Hi ${personName}, our accounts are completely settled up (${formatMoney(0)}). Thanks!${fromTag}`;
  }

  return message;
}

// Play satisfying subtle chime feedback
function playChime(type = "success") {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === "settle") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.2); // C6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // AudioContext blocked or not allowed yet by user gesture
  }
}

// Pure JS QR Code Generator for offline camera-scannable UPI QR display
function generateSvgQr(text) {
  if (typeof QRGenerator !== "undefined" && QRGenerator.toSvg) {
    try {
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
          ${QRGenerator.toSvg(text, 4)}
          <a href="${text}" style="font-size:0.82rem; color:var(--brand-primary); text-decoration:none; font-weight:600;">Tap to Open in UPI App</a>
        </div>`;
    } catch (e) {
      console.warn("QR generation error", e);
    }
  }
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
      <p style="font-size:0.85rem; color:#64748b;">Pay via UPI</p>
      <a href="${text}" style="font-size:0.82rem; color:var(--brand-primary); text-decoration:none; font-weight:600;">Tap to Open in UPI App</a>
    </div>`;
}

// Share full itemized account ledger over WhatsApp
function shareStatementOnWhatsApp(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;

  const phone = getInternationalPhone(person);
  if (!phone) {
    showToast("Please add a mobile number for this contact first");
    return;
  }

  const entries = state.entries
    .filter((e) => e.personId === personId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const balance = calculatePersonBalance(personId);
  const sender = state.settings.yourName.trim();
  const upi = state.settings.upiId.trim();

  let msg = `📜 *Hisab Statement for ${person.name}*\n`;
  if (sender) msg += `From: ${sender}\n`;
  msg += `---------------------------\n`;

  if (entries.length) {
    entries.forEach((e, idx) => {
      const type = e.direction === "gave" ? "Gave (+)" : "Got (−)";
      msg += `${idx + 1}. ${e.date}: ${e.note || e.category} → ${type} ${formatMoney(e.amount)}\n`;
    });
  } else {
    msg += `No past transactions recorded.\n`;
  }

  msg += `---------------------------\n`;
  if (balance > 0.009) {
    msg += `👉 *Pending Balance: ${formatMoney(balance)} (to give me)*\n`;
  } else if (balance < -0.009) {
    msg += `👉 *Balance: ${formatMoney(balance)} (I have to give you)*\n`;
  } else {
    msg += `👉 *Balance: Settled (${formatMoney(0)})*\n`;
  }

  if (upi && balance > 0.009) {
    msg += `\n⚡ Pay directly via UPI: ${upi}\n`;
  }
  msg += `\nThank you!`;

  const waMode = state.settings.whatsappMode || "app_direct";
  const hasGreenApi = waMode === "direct_greenapi" && (state.settings.greenApiInstance || "").trim() && (state.settings.greenApiToken || "").trim();

  if (hasGreenApi) {
    sendDirectWhatsApp(phone, msg)
      .then(() => {
        playChime("success");
        showToast(`✅ Statement sent directly to ${person.name}'s WhatsApp!`);
      })
      .catch((err) => {
        showToast(`Direct send failed (${err.message}). Opening WhatsApp…`);
        openExternalLink(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`);
      });
    return;
  }

  // Official universal WhatsApp link
  openExternalLink(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`);
  showToast("Opening WhatsApp statement…");
}

// Reliable unblockable link opener (bypasses browser popup blocker)
function openExternalLink(url, target = "_blank") {
  const link = document.createElement("a");
  link.href = url;
  if (target) link.target = target;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 100);
}
async function sendDirectWhatsApp(fullPhone, message) {
  const mode = state.settings.whatsappMode || "app_direct";
  const cleanPhone = cleanDigits(fullPhone);

  if (mode === "direct_greenapi") {
    const instance = (state.settings.greenApiInstance || "").trim();
    const token = (state.settings.greenApiToken || "").trim();
    if (!instance || !token) {
      throw new Error("Green API credentials missing. Please set Instance ID & Token in Settings.");
    }
    const url = `https://api.green-api.com/waInstance${instance}/sendMessage/${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: `${cleanPhone}@c.us`,
        message: message,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Green API returned status ${res.status}`);
    }
    return { success: true, provider: "Green API" };
  }

  if (mode === "direct_ultramsg") {
    const instance = (state.settings.ultraMsgInstance || "").trim();
    const token = (state.settings.ultraMsgToken || "").trim();
    if (!instance || !token) {
      throw new Error("UltraMsg credentials missing. Please set Instance ID & Token in Settings.");
    }
    const url = `https://api.ultramsg.com/${instance}/messages/chat`;
    const body = new URLSearchParams({
      token: token,
      to: cleanPhone,
      body: message,
    });
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) {
      throw new Error(`UltraMsg returned status ${res.status}`);
    }
    return { success: true, provider: "UltraMsg" };
  }

  if (mode === "direct_custom") {
    const webhook = (state.settings.customWhatsappWebhook || "").trim();
    if (!webhook) {
      throw new Error("Custom Webhook URL missing in Settings.");
    }
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone, message: message }),
    });
    if (!res.ok) {
      throw new Error(`Webhook returned status ${res.status}`);
    }
    return { success: true, provider: "Custom Webhook" };
  }

  return { direct: false };
}

// Direct SMS API Dispatcher (Fast2SMS / Twilio)
async function sendDirectSms(fullPhone, message) {
  const mode = state.settings.smsMode || "device";
  const cleanPhone = cleanDigits(fullPhone);

  if (mode === "fast2sms") {
    const apiKey = (state.settings.fast2smsApiKey || "").trim();
    if (!apiKey) {
      throw new Error("Fast2SMS API Key missing. Please set your key in Settings.");
    }
    // Fast2SMS takes 10-digit Indian numbers without country code
    const num10 = cleanPhone.length > 10 && cleanPhone.startsWith("91") ? cleanPhone.slice(2) : cleanPhone;
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        language: "english",
        flash: 0,
        numbers: num10,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.return === false) {
      throw new Error(data.message || `Fast2SMS dispatch failed`);
    }
    return { success: true, provider: "Fast2SMS" };
  }

  if (mode === "twilio") {
    const sid = (state.settings.twilioSid || "").trim();
    const token = (state.settings.twilioToken || "").trim();
    const from = (state.settings.twilioFrom || "").trim();
    if (!sid || !token || !from) {
      throw new Error("Twilio credentials missing in Settings.");
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({
      To: `+${cleanPhone}`,
      From: from,
      Body: message,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Twilio returned status ${res.status}`);
    }
    return { success: true, provider: "Twilio" };
  }

  return { direct: false };
}

// Open Reminder Dialog
function openRemindDialog(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;

  if (!cleanDigits(person.phone)) {
    showToast("Please add a mobile number for this contact first");
    openPersonDialog(person);
    return;
  }

  remindPersonId = personId;
  const balance = calculatePersonBalance(personId);

  const fullPhone = getInternationalPhone(person);
  $("#remind-target-info").textContent = `To: ${person.name} (+${fullPhone})`;

  // Update Direct Sending Mode Badge
  const badgeEl = $("#remind-direct-badge");
  const waMode = state.settings.whatsappMode || "app_direct";
  const btnWaText = $("#btn-whatsapp-text");
  const btnSmsText = $("#btn-sms-text");

  if (waMode !== "app_direct") {
    const providerLabel = waMode === "direct_greenapi" ? "Green API" : waMode === "direct_ultramsg" ? "UltraMsg" : "Webhook";
    badgeEl.className = "direct-badge-box direct-badge-active";
    badgeEl.innerHTML = `<span><span class="pulse-dot"></span>⚡ <strong>Direct WhatsApp Active (${providerLabel})</strong>: Sends in background without opening WhatsApp!</span>`;
    if (btnWaText) btnWaText.textContent = "⚡ Send Directly via WhatsApp";
  } else {
    badgeEl.className = "direct-badge-box direct-badge-standard";
    badgeEl.innerHTML = `<span><span class="pulse-dot" style="background:#0284c7;"></span> 🔗 Mode: 1-Click WhatsApp</span> <button type="button" class="btn-text" id="remind-enable-direct-btn">⚡ Enable Direct Sending</button>`;
    if (btnWaText) btnWaText.textContent = "Open in WhatsApp";
  }

  if (state.settings.smsMode && state.settings.smsMode !== "device") {
    if (btnSmsText) btnSmsText.textContent = "⚡ Send Direct SMS";
  } else {
    if (btnSmsText) btnSmsText.textContent = "SMS Message";
  }

  // Hook up shortcut to settings from the badge
  const enableDirectBtn = $("#remind-enable-direct-btn");
  if (enableDirectBtn) {
    enableDirectBtn.onclick = () => {
      closeModal($("#remind-dialog"));
      openSettingsToTab("subtab-whatsapp");
    };
  }

  // Generate initial message
  currentRemindTemplate = "casual";
  $$(".temp-chip").forEach((c) => c.classList.toggle("active", c.dataset.template === "casual"));
  $("#remind-message-box").value = buildReminderMessage(person, "casual");

  // UPI Box
  const upiId = (state.settings.upiId || "").trim();
  const upiBox = $("#remind-upi-box");
  const qrDisplay = $("#qr-display-container");
  qrDisplay.classList.add("hidden");
  $("#toggle-qr-view").textContent = "Show QR Code";

  if (upiId && balance > 0) {
    upiBox.style.display = "block";
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(state.settings.yourName || "User")}&am=${balance.toFixed(2)}&cu=INR`;
    $("#qr-code-canvas").innerHTML = generateSvgQr(upiUri);
  } else {
    upiBox.style.display = "none";
  }

  openModal($("#remind-dialog"));
}

// Send Reminder execution
async function triggerReminder(channel) {
  const person = state.people.find((p) => p.id === remindPersonId);
  if (!person) return;

  const fullPhone = getInternationalPhone(person);
  const text = $("#remind-message-box").value.trim();

  if (!text) {
    showToast("Please write a message first");
    return;
  }

  const encoded = encodeURIComponent(text);

  if (channel === "whatsapp") {
    const btn = $("#btn-send-whatsapp");
    const btnText = $("#btn-whatsapp-text");
    const origText = btnText ? btnText.textContent : "Send on WhatsApp";
    const waMode = state.settings.whatsappMode || "app_direct";

    const hasGreenApi = waMode === "direct_greenapi" && (state.settings.greenApiInstance || "").trim() && (state.settings.greenApiToken || "").trim();
    const hasUltraMsg = waMode === "direct_ultramsg" && (state.settings.ultraMsgInstance || "").trim() && (state.settings.ultraMsgToken || "").trim();
    const hasWebhook = waMode === "direct_custom" && (state.settings.customWhatsappWebhook || "").trim();

    // If direct background API credentials exist, use background API
    if (hasGreenApi || hasUltraMsg || hasWebhook) {
      try {
        btn.classList.add("btn-loading");
        if (btnText) btnText.innerHTML = '<span class="spinner"></span> Sending directly…';
        await sendDirectWhatsApp(fullPhone, text);

        person.lastReminded = new Date().toISOString();
        saveState();
        renderAll();
        playChime("success");
        showToast(`✅ WhatsApp message sent directly to ${person.name}!`);
        closeModal($("#remind-dialog"));
        return;
      } catch (err) {
        showToast(`Direct send failed: ${err.message}. Opening WhatsApp…`);
      } finally {
        btn.classList.remove("btn-loading");
        if (btnText) btnText.textContent = origText;
      }
    }

    // Official WhatsApp Universal Link: Never blocked by popup blockers!
    person.lastReminded = new Date().toISOString();
    saveState();
    renderAll();

    // Open WhatsApp directly to chat
    const waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encoded}`;
    openExternalLink(waUrl);
    showToast("Opening WhatsApp chat directly…");
    closeModal($("#remind-dialog"));
  } else if (channel === "sms") {
    const btn = $("#btn-send-sms");
    const btnText = $("#btn-sms-text");
    const origText = btnText ? btnText.textContent : "SMS Message";
    const smsMode = state.settings.smsMode || "device";

    const hasFast2sms = smsMode === "fast2sms" && (state.settings.fast2smsApiKey || "").trim();
    const hasTwilio = smsMode === "twilio" && (state.settings.twilioSid || "").trim() && (state.settings.twilioToken || "").trim();

    if (hasFast2sms || hasTwilio) {
      try {
        btn.classList.add("btn-loading");
        if (btnText) btnText.innerHTML = '<span class="spinner"></span> Sending SMS…';
        await sendDirectSms(fullPhone, text);

        person.lastReminded = new Date().toISOString();
        saveState();
        renderAll();
        playChime("success");
        showToast(`✅ Real SMS delivered directly to +${fullPhone}!`);
        closeModal($("#remind-dialog"));
        return;
      } catch (err) {
        showToast(`Direct SMS failed: ${err.message}`);
      } finally {
        btn.classList.remove("btn-loading");
        if (btnText) btnText.textContent = origText;
      }
    }

    // Device fallback
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      person.lastReminded = new Date().toISOString();
      saveState();
      renderAll();

      const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const smsUrl = isApple ? `sms:+${fullPhone}&body=${encoded}` : `sms:+${fullPhone}?body=${encoded}`;
      openExternalLink(smsUrl, "_self");
      showToast("Opening native Messages app…");
      closeModal($("#remind-dialog"));
    } else {
      // Desktop PC: Windows PCs don't have cellular SIMs. Open Desktop SMS helper dialog!
      person.lastReminded = new Date().toISOString();
      saveState();
      renderAll();
      openDesktopSmsModal(person, text, fullPhone);
    }
  }
}

// Helper to open Desktop PC SMS Dialog
function openDesktopSmsModal(person, text, fullPhone) {
  const encoded = encodeURIComponent(text);
  $("#desktop-sms-info").textContent = `To: ${person.name} (+${fullPhone})`;
  openModal($("#desktop-sms-dialog"));

  const phoneLinkBtn = $("#btn-open-phone-link");
  if (phoneLinkBtn) {
    phoneLinkBtn.onclick = () => {
      openExternalLink(`ms-chat:?addresses=${fullPhone}&body=${encoded}`, "_self");
      showToast("Launching Windows Phone Link…");
    };
  }

  $("#btn-open-google-messages").onclick = () => {
    openExternalLink("https://messages.google.com/web");
    navigator.clipboard.writeText(`To: +${fullPhone}\n\n${text}`);
    showToast("Opened Google Messages Web & copied message!");
  };

  $("#btn-copy-sms-direct").onclick = async () => {
    try {
      await navigator.clipboard.writeText(`To: +${fullPhone}\n\n${text}`);
      showToast("Copied phone number & text to clipboard!");
    } catch {
      showToast("Copied text!");
    }
    closeModal($("#desktop-sms-dialog"));
  };

  $("#btn-setup-fast2sms-shortcut").onclick = () => {
    closeModal($("#desktop-sms-dialog"));
    closeModal($("#remind-dialog"));
    openSettingsToTab("subtab-sms");
  };
}

// Sample Demo Data Loader
function loadSampleData() {
  const samplePeople = [
    { id: uid(), name: "Rahul Sharma", phone: "9876543210", notes: "Flatmate", lastReminded: null, createdAt: new Date().toISOString() },
    { id: uid(), name: "Priya Patel", phone: "9823456789", notes: "Colleague", lastReminded: null, createdAt: new Date().toISOString() },
    { id: uid(), name: "Amit Verma", phone: "9123456780", notes: "College friend", lastReminded: null, createdAt: new Date().toISOString() },
  ];

  const today = getTodayString();
  const sampleEntries = [
    {
      id: uid(),
      personId: samplePeople[0].id,
      direction: "gave",
      amount: 1450,
      category: "🏠 Rent & Bills",
      paymentMethod: "UPI / Online",
      date: today,
      note: "Electricity & Wi-Fi bill share",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid(),
      personId: samplePeople[0].id,
      direction: "got",
      amount: 500,
      category: "🔄 Settle Up",
      paymentMethod: "UPI / Online",
      date: today,
      note: "Partial repayment",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid(),
      personId: samplePeople[1].id,
      direction: "gave",
      amount: 680,
      category: "🍔 Food & Drinks",
      paymentMethod: "UPI / Online",
      date: today,
      note: "Team lunch split at BBQ Nation",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid(),
      personId: samplePeople[2].id,
      direction: "got",
      amount: 350,
      category: "🚗 Travel & Fuel",
      paymentMethod: "Cash",
      date: today,
      note: "Cab ride to airport (borrowed)",
      createdAt: new Date().toISOString(),
    },
  ];

  state.people = samplePeople;
  state.entries = sampleEntries;
  saveState();
  renderAll();
  showToast("Demo contacts & transactions loaded!");
}

// Export to CSV
function triggerDownload(content, filename, mimeType) {
  try {
    // Method 1: Blob + object URL (works in most browsers, including PWA)
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    // Delay revoke so browser has time to initiate download
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 1500);
  } catch (err) {
    // Method 2: data: URI fallback (works on file:// protocol)
    try {
      const encoded = encodeURIComponent(content);
      const dataUrl = `data:${mimeType};charset=utf-8,${encoded}`;
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 1500);
    } catch (err2) {
      // Method 3: Open in new tab (last resort — user can Ctrl+S to save)
      const encoded = encodeURIComponent(content);
      window.open(`data:${mimeType};charset=utf-8,${encoded}`, "_blank");
      showToast("File opened in new tab — press Ctrl+S to save it");
    }
  }
}

function exportToCsv() {
  if (!state.entries.length) {
    showToast("No transactions to export");
    return;
  }

  const headers = ["Transaction ID", "Date", "Person Name", "Direction", "Amount", "Currency", "Category", "Payment Method", "Note"];
  const rows = state.entries.map((e) => {
    const person = state.people.find((p) => p.id === e.personId);
    return [
      `"${e.id}"`,
      `"${e.date}"`,
      `"${person ? person.name : "Unknown"}"`,
      `"${e.direction === "gave" ? "Gave (+)" : "Got (-)"}"`,
      e.amount,
      `"${state.settings.currency}"`,
      `"${e.category || ""}"`,
      `"${e.paymentMethod || ""}"`,
      `"${(e.note || "").replace(/"/g, '""')}"`,
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");
  triggerDownload(csvContent, `hisab-ledger-${getTodayString()}.csv`, "text/csv;charset=utf-8;");
  showToast("CSV downloaded ✓");
}

// Export to JSON
function exportToJson() {
  const jsonContent = JSON.stringify(state, null, 2);
  triggerDownload(jsonContent, `hisab-backup-${getTodayString()}.json`, "application/json");
  showToast("Backup file downloaded ✓");
}

// ----------------------------------------------------
// EVENT LISTENERS & WIRING
// ----------------------------------------------------

// Tabs switching
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".tab-content").forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    $(`#${activeTab}`).classList.add("active");
  });
});

// Theme toggle
$("#theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
});

// Search & filters for People tab
$("#people-search").addEventListener("input", (e) => {
  peopleQuery = e.target.value.trim().toLowerCase();
  renderPeopleList();
});

$$(".control-bar .chip[data-filter]").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".control-bar .chip[data-filter]").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    peopleFilter = chip.dataset.filter;
    renderPeopleList();
  });
});

// Search & filters for Feed tab
$("#feed-search").addEventListener("input", (e) => {
  feedQuery = e.target.value.trim().toLowerCase();
  renderActivityFeed();
});

$$(".control-bar .chip[data-feed-filter]").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".control-bar .chip[data-feed-filter]").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    feedFilter = chip.dataset.feedFilter;
    renderActivityFeed();
  });
});

$("#category-filter").addEventListener("change", (e) => {
  feedCategory = e.target.value;
  renderActivityFeed();
});

// Quick Action Buttons
$("#btn-add-person").addEventListener("click", () => openPersonDialog());
$("#btn-quick-entry").addEventListener("click", () => openEntryDialog());

// People Card Actions Delegator
$("#people-list").addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest(".person-card");
  const personId = card.dataset.personId;
  const action = button.dataset.action;

  if (action === "gave") {
    openEntryDialog(personId, "gave");
  } else if (action === "got") {
    openEntryDialog(personId, "got");
  } else if (action === "settle") {
    const bal = calculatePersonBalance(personId);
    if (Math.abs(bal) <= 0.009) {
      showToast("Balance is already settled");
      return;
    }
    // If they owe you (bal > 0), settling means you get the money (direction: 'got')
    // If you owe them (bal < 0), settling means you gave the money (direction: 'gave')
    const direction = bal > 0 ? "got" : "gave";
    openEntryDialog(personId, direction);
    $("#entry-amount-input").value = Math.abs(bal).toFixed(2);
    $("#entry-category-select").value = "🔄 Settle Up";
    $("#entry-note-input").value = "Settled balance in full";
  } else if (action === "remind") {
    openRemindDialog(personId);
  } else if (action === "history") {
    openHistoryDialog(personId);
  }
});

// Activity Feed Actions Delegator (Edit & Delete)
$("#activity-feed").addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-entry]");
  const deleteBtn = e.target.closest("[data-delete-entry]");

  if (editBtn) {
    const entryId = editBtn.dataset.editEntry;
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry) openEntryDialog(entry.personId, entry.direction, entry);
  } else if (deleteBtn) {
    const entryId = deleteBtn.dataset.deleteEntry;
    if (confirm("Are you sure you want to delete this transaction entry?")) {
      state.entries = state.entries.filter((item) => item.id !== entryId);
      saveState();
      renderAll();
      showToast("Transaction deleted");
    }
  }
});

// Contact History Dialog Actions
$("#history-btn-gave").addEventListener("click", () => openEntryDialog(historyPersonId, "gave"));
$("#history-btn-got").addEventListener("click", () => openEntryDialog(historyPersonId, "got"));
$("#history-btn-settle").addEventListener("click", () => {
  const bal = calculatePersonBalance(historyPersonId);
  if (Math.abs(bal) <= 0.009) {
    showToast("Balance is already settled");
    return;
  }
  const direction = bal > 0 ? "got" : "gave";
  openEntryDialog(historyPersonId, direction);
  $("#entry-amount-input").value = Math.abs(bal).toFixed(2);
  $("#entry-category-select").value = "🔄 Settle Up";
  $("#entry-note-input").value = "Settled balance in full";
});
$("#history-btn-remind").addEventListener("click", () => openRemindDialog(historyPersonId));
$("#history-btn-whatsapp-statement").addEventListener("click", () => shareStatementOnWhatsApp(historyPersonId));
$("#history-btn-print").addEventListener("click", () => printStatementForPerson(historyPersonId));

$("#history-btn-edit").addEventListener("click", () => {
  const person = state.people.find((p) => p.id === historyPersonId);
  if (person) openPersonDialog(person);
});

$("#history-btn-delete").addEventListener("click", () => {
  const person = state.people.find((p) => p.id === historyPersonId);
  if (!person) return;
  if (confirm(`Delete ${person.name} and ALL transactions with them? This cannot be undone.`)) {
    state.people = state.people.filter((p) => p.id !== person.id);
    state.entries = state.entries.filter((e) => e.personId !== person.id);
    saveState();
    closeModal($("#history-dialog"));
    renderAll();
    showToast("Contact and history deleted");
  }
});

$("#history-entries-list").addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-entry]");
  const deleteBtn = e.target.closest("[data-delete-entry]");

  if (editBtn) {
    const entry = state.entries.find((item) => item.id === editBtn.dataset.editEntry);
    if (entry) openEntryDialog(entry.personId, entry.direction, entry);
  } else if (deleteBtn) {
    if (confirm("Delete this entry?")) {
      state.entries = state.entries.filter((item) => item.id !== deleteBtn.dataset.deleteEntry);
      saveState();
      renderAll();
      openHistoryDialog(historyPersonId);
      showToast("Entry deleted");
    }
  }
});

// Dialog Close buttons
document.body.addEventListener("click", (e) => {
  if (e.target.matches("[data-close]") || e.target.closest("[data-close]")) {
    const dialog = e.target.closest("dialog");
    if (dialog) closeModal(dialog);
  }
});

// Backdrop click closes dialog
$$("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d) closeModal(d);
  });
});

// Person Form Submit
$("#person-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const notes = form.notes.value.trim();

  if (!name) {
    showToast("Please enter a contact name");
    return;
  }

  if (editingPersonId) {
    const person = state.people.find((p) => p.id === editingPersonId);
    if (person) {
      person.name = name;
      person.phone = phone;
      person.notes = notes;
      showToast("Contact updated");
      playChime("success");
    }
  } else {
    state.people.push({
      id: uid(),
      name,
      phone,
      notes,
      lastReminded: null,
      createdAt: new Date().toISOString(),
    });
    showToast("Contact added");
    playChime("success");
  }

  saveState();
  closeModal($("#person-dialog"));
  renderAll();

  if ($("#history-dialog").open && historyPersonId) {
    openHistoryDialog(historyPersonId);
  }
});

// Entry Form Submit
$("#entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const personId = form.personId.value;
  const direction = form.querySelector('input[name="direction"]:checked')?.value || "gave";
  const amount = Number(form.amount.value);
  const date = form.date.value;
  const category = form.category.value;
  const paymentMethod = form.paymentMethod.value;
  const note = form.note.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Please enter a valid amount greater than zero");
    return;
  }

  const payload = {
    personId,
    direction,
    amount,
    date,
    category,
    paymentMethod,
    note,
  };

  if (currentEntryContext.entryId) {
    const existing = state.entries.find((e) => e.id === currentEntryContext.entryId);
    if (existing) {
      Object.assign(existing, payload);
      showToast("Transaction updated");
      playChime("success");
    }
  } else {
    state.entries.push({
      id: uid(),
      ...payload,
      createdAt: new Date().toISOString(),
    });
    showToast("Transaction saved");
    if (category === "🔄 Settle Up") playChime("settle");
    else playChime("success");
  }

  saveState();
  closeModal($("#entry-dialog"));
  renderAll();

  if ($("#history-dialog").open && historyPersonId) {
    openHistoryDialog(historyPersonId);
  }
});

// Reminder Template Selection
$$(".temp-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".temp-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentRemindTemplate = chip.dataset.template;

    const person = state.people.find((p) => p.id === remindPersonId);
    if (person) {
      $("#remind-message-box").value = buildReminderMessage(person, currentRemindTemplate);
    }
  });
});

// Toggle QR View
$("#toggle-qr-view").addEventListener("click", () => {
  const qrBox = $("#qr-display-container");
  const isHidden = qrBox.classList.contains("hidden");
  qrBox.classList.toggle("hidden", !isHidden);
  $("#toggle-qr-view").textContent = isHidden ? "Hide QR Code" : "Show QR Code";
});

// Copy Reminder Text
$("#btn-copy-reminder").addEventListener("click", async () => {
  const text = $("#remind-message-box").value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Message copied to clipboard!");
  } catch (err) {
    // Fallback for clipboard
    const textarea = $("#remind-message-box");
    textarea.select();
    document.execCommand("copy");
    showToast("Message copied!");
  }
});

// Send WhatsApp & SMS
$("#btn-send-whatsapp").addEventListener("click", () => triggerReminder("whatsapp"));
$("#btn-send-sms").addEventListener("click", () => triggerReminder("sms"));

// Helper to open Settings directly to a subtab
function openSettingsToTab(subtabId = "subtab-general") {
  const form = $("#settings-form");
  form.yourName.value = state.settings.yourName || "";
  form.currency.value = state.settings.currency || "₹";
  form.countryCode.value = state.settings.countryCode || "91";
  form.upiId.value = state.settings.upiId || "";

  // WhatsApp Gateway fields
  form.whatsappMode.value = state.settings.whatsappMode || "app_direct";
  form.greenApiInstance.value = state.settings.greenApiInstance || "";
  form.greenApiToken.value = state.settings.greenApiToken || "";
  form.ultraMsgInstance.value = state.settings.ultraMsgInstance || "";
  form.ultraMsgToken.value = state.settings.ultraMsgToken || "";
  form.customWhatsappWebhook.value = state.settings.customWhatsappWebhook || "";

  // SMS Gateway fields
  form.smsMode.value = state.settings.smsMode || "device";
  form.fast2smsApiKey.value = state.settings.fast2smsApiKey || "";
  form.twilioSid.value = state.settings.twilioSid || "";
  form.twilioToken.value = state.settings.twilioToken || "";
  form.twilioFrom.value = state.settings.twilioFrom || "";

  updateGatewayVisibility();
  $("#test-wa-status").textContent = "";
  $("#test-sms-status").textContent = "";

  // Switch to target subtab
  $$(".settings-tab-btn").forEach((b) => b.classList.remove("active"));
  $$(".settings-subtab-pane").forEach((p) => p.classList.remove("active"));
  const tabBtn = $(`[data-subtab="${subtabId}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  const tabPane = $(`#${subtabId}`);
  if (tabPane) tabPane.classList.add("active");

  openModal($("#settings-dialog"));
}

function updateGatewayVisibility() {
  const waMode = $("#setting-wa-mode").value;
  $("#box-greenapi").classList.toggle("hidden", waMode !== "direct_greenapi");
  $("#box-ultramsg").classList.toggle("hidden", waMode !== "direct_ultramsg");
  $("#box-custom-wa").classList.toggle("hidden", waMode !== "direct_custom");

  const smsMode = $("#setting-sms-mode").value;
  $("#box-fast2sms").classList.toggle("hidden", smsMode !== "fast2sms");
  $("#box-twilio").classList.toggle("hidden", smsMode !== "twilio");
}

// Settings Dialog Open & Save
$("#open-settings").addEventListener("click", () => openSettingsToTab("subtab-general"));

// Settings Subtabs Event
$$(".settings-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".settings-tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".settings-subtab-pane").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const pane = $(`#${btn.dataset.subtab}`);
    if (pane) pane.classList.add("active");
  });
});

$("#setting-wa-mode").addEventListener("change", updateGatewayVisibility);
$("#setting-sms-mode").addEventListener("change", updateGatewayVisibility);

// Test WhatsApp Connection Button
$("#btn-test-whatsapp").addEventListener("click", async () => {
  const statusEl = $("#test-wa-status");
  statusEl.className = "test-status";
  statusEl.textContent = "Testing connection…";

  const mode = $("#setting-wa-mode").value;
  if (mode === "app_direct") {
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ 1-Click WhatsApp ready (opens chat directly)";
    return;
  }

  if (mode === "direct_greenapi") {
    const instance = $("#setting-greenapi-instance").value.trim();
    const token = $("#setting-greenapi-token").value.trim();
    if (!instance || !token) {
      statusEl.className = "test-status error";
      statusEl.textContent = "✗ Please enter both Instance ID and Token";
      return;
    }
    try {
      const res = await fetch(`https://api.green-api.com/waInstance${instance}/getStateInstance/${token}`);
      const data = await res.json();
      if (data.stateInstance === "authorized") {
        statusEl.className = "test-status success";
        statusEl.textContent = "✓ Connected & Authorized! Ready to send.";
      } else {
        statusEl.className = "test-status error";
        statusEl.textContent = `Status: ${data.stateInstance || "Not authorized"}. Scan QR code at green-api.com!`;
      }
    } catch (e) {
      statusEl.className = "test-status error";
      statusEl.textContent = `Connection error: ${e.message}`;
    }
  } else if (mode === "direct_ultramsg") {
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ UltraMsg credentials saved. Test on real reminder!";
  } else if (mode === "direct_custom") {
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ Webhook URL configured.";
  }
});

// Test SMS Connection Button
$("#btn-test-sms").addEventListener("click", async () => {
  const statusEl = $("#test-sms-status");
  statusEl.className = "test-status";
  statusEl.textContent = "Checking credentials…";

  const mode = $("#setting-sms-mode").value;
  if (mode === "device") {
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ Device / Google Messages Web ready.";
    return;
  }

  if (mode === "fast2sms") {
    const key = $("#setting-fast2sms-key").value.trim();
    if (!key) {
      statusEl.className = "test-status error";
      statusEl.textContent = "✗ Please enter your Fast2SMS API Key";
      return;
    }
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ Fast2SMS key configured. Real SMS will be sent on demand!";
  } else if (mode === "twilio") {
    statusEl.className = "test-status success";
    statusEl.textContent = "✓ Twilio settings saved.";
  }
});

$("#settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const currency = form.currency.value.trim();
  const countryCode = cleanDigits(form.countryCode.value);

  if (!currency || !countryCode) {
    showToast("Currency symbol and country code are required");
    return;
  }

  state.settings.yourName = form.yourName.value.trim();
  state.settings.currency = currency;
  state.settings.countryCode = countryCode;
  state.settings.upiId = form.upiId.value.trim();

  // WhatsApp Gateway fields
  state.settings.whatsappMode = form.whatsappMode.value;
  state.settings.greenApiInstance = form.greenApiInstance.value.trim();
  state.settings.greenApiToken = form.greenApiToken.value.trim();
  state.settings.ultraMsgInstance = form.ultraMsgInstance.value.trim();
  state.settings.ultraMsgToken = form.ultraMsgToken.value.trim();
  state.settings.customWhatsappWebhook = form.customWhatsappWebhook.value.trim();

  // SMS Gateway fields
  state.settings.smsMode = form.smsMode.value;
  state.settings.fast2smsApiKey = form.fast2smsApiKey.value.trim();
  state.settings.twilioSid = form.twilioSid.value.trim();
  state.settings.twilioToken = form.twilioToken.value.trim();
  state.settings.twilioFrom = form.twilioFrom.value.trim();

  saveState();
  closeModal($("#settings-dialog"));
  renderAll();
  showToast("Settings updated successfully!");
});

// Backup & Restore Events
$("#btn-export-json").addEventListener("click", exportToJson);
$("#btn-export-csv").addEventListener("click", exportToCsv);
$("#btn-load-sample").addEventListener("click", () => {
  if (confirm("Load demo contacts and sample transactions? (Existing data will be replaced)")) {
    loadSampleData();
  }
});

$("#btn-import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.people) || !Array.isArray(parsed.entries)) {
      throw new Error("Invalid structure");
    }

    state = {
      settings: { ...defaultSettings(), ...parsed.settings },
      people: parsed.people,
      entries: parsed.entries,
    };

    saveState();
    closeModal($("#settings-dialog"));
    renderAll();
    showToast("Backup restored successfully!");
  } catch (err) {
    showToast("Failed to restore: Invalid backup file");
  }
});

// ----------------------------------------------------
// PROFILE / LEDGER SWITCHER — Render & Logic
// ----------------------------------------------------

let deferredPwaPrompt = null;

/** Update the pill button in the header to show active profile */
function renderProfilePill() {
  const profile = getActiveProfile();
  const iconEl = $("#active-profile-icon");
  const nameEl = $("#active-profile-name");
  if (iconEl) iconEl.textContent = profile.icon || "👤";
  if (nameEl) nameEl.textContent = profile.name || "Ledger";
}

/** Render the list of ledger cards inside the manager dialog */
function renderLedgersList() {
  const listEl = $("#ledgers-list");
  if (!listEl) return;

  if (profileState.profiles.length === 0) {
    listEl.innerHTML = `<p class="empty-hint">No ledgers found. Create one below.</p>`;
    return;
  }

  listEl.innerHTML = profileState.profiles.map((p) => {
    const isActive = p.id === profileState.activeProfileId;
    const entryCount = (() => {
      try {
        const raw = localStorage.getItem(getProfileStorageKey(p.id));
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        return (parsed.entries || []).length;
      } catch { return 0; }
    })();
    const hasPin = !!p.pin;

    return `
      <div class="ledger-item-card${isActive ? " active" : ""}" data-ledger-id="${p.id}">
        <div class="ledger-item-left">
          <span class="ledger-icon">${p.icon || "👤"}</span>
          <div class="ledger-info">
            <h4>${escapeHtml(p.name)} ${hasPin ? "🔒" : ""}</h4>
            <p>${entryCount} transaction${entryCount !== 1 ? "s" : ""}${isActive ? " · Currently active" : ""}</p>
          </div>
        </div>
        <div class="ledger-item-right">
          ${isActive
            ? `<span class="ledger-badge-active">✓ Active</span>`
            : `<button type="button" class="btn btn-sm btn-outline" data-switch-to="${p.id}">Switch</button>`
          }
          ${p.id !== "default"
            ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-delete-ledger="${p.id}" title="Delete ledger">🗑️</button>`
            : ""
          }
        </div>
      </div>`;
  }).join("");
}

/** Request switching — will ask for PIN if ledger is locked */
function requestSwitchToProfile(targetId) {
  const target = profileState.profiles.find((p) => p.id === targetId);
  if (!target) return;

  if (target.pin) {
    // Locked — show PIN dialog
    pendingSwitchProfileId = targetId;
    const nameEl = $("#pin-prompt-ledger-name");
    if (nameEl) nameEl.textContent = `Enter PIN to access "${target.name}"`;
    const inputEl = $("#pin-input-field");
    if (inputEl) inputEl.value = "";
    const errEl = $("#pin-error-msg");
    if (errEl) errEl.classList.add("hidden");
    openModal($("#pin-prompt-dialog"));
  } else {
    doSwitchProfile(targetId);
  }
}

/** Actually switch to a profile — reload state and re-render */
function doSwitchProfile(targetId) {
  profileState.activeProfileId = targetId;
  saveProfilesState();
  state = loadInitialState();
  closeModal($("#pin-prompt-dialog"));
  closeModal($("#ledger-manager-dialog"));
  renderAll();
  renderProfilePill();
  const profile = getActiveProfile();
  showToast(`Switched to "${profile.name}"`);
}

/** HTML-escape helper */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ----------------------------------------------------
// PROFILE WIRING — Event Listeners
// ----------------------------------------------------

// Open ledger manager dialog
const profilePillBtn = $("#btn-profile-pill");
if (profilePillBtn) {
  profilePillBtn.addEventListener("click", () => {
    renderLedgersList();
    openModal($("#ledger-manager-dialog"));
  });
}

// Open "create new ledger" dialog from manager
const btnOpenCreateLedger = $("#btn-open-create-ledger");
if (btnOpenCreateLedger) {
  btnOpenCreateLedger.addEventListener("click", () => {
    const form = $("#create-ledger-form");
    if (form) form.reset();
    openModal($("#create-ledger-dialog"));
  });
}

// Create ledger form submit
const createLedgerForm = $("#create-ledger-form");
if (createLedgerForm) {
  createLedgerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const icon = form.icon.value || "👤";
    const currency = form.currency.value.trim() || "₹";
    const pin = form.pin.value.trim();

    if (!name) {
      showToast("Please enter a ledger name");
      return;
    }
    if (pin && (!/^\d{4}$/.test(pin))) {
      showToast("PIN must be exactly 4 digits");
      return;
    }

    const newId = uid();
    profileState.profiles.push({
      id: newId,
      name,
      icon,
      pin: pin || null,
      createdAt: new Date().toISOString(),
    });

    // Create empty storage for new profile with currency setting
    const newProfileData = {
      settings: { ...defaultSettings(), currency },
      people: [],
      entries: [],
    };
    localStorage.setItem(getProfileStorageKey(newId), JSON.stringify(newProfileData));

    saveProfilesState();
    closeModal($("#create-ledger-dialog"));
    doSwitchProfile(newId);
    showToast(`Ledger "${name}" created!`);
  });
}

// Delegated clicks inside ledgers-list (switch / delete)
const ledgersListEl = $("#ledgers-list");
if (ledgersListEl) {
  ledgersListEl.addEventListener("click", (e) => {
    const switchBtn = e.target.closest("[data-switch-to]");
    if (switchBtn) {
      requestSwitchToProfile(switchBtn.dataset.switchTo);
      return;
    }
    const deleteBtn = e.target.closest("[data-delete-ledger]");
    if (deleteBtn) {
      const pid = deleteBtn.dataset.deleteLedger;
      const profile = profileState.profiles.find((p) => p.id === pid);
      if (!profile) return;
      if (!confirm(`Delete ledger "${profile.name}" and ALL its data? This cannot be undone.`)) return;
      profileState.profiles = profileState.profiles.filter((p) => p.id !== pid);
      localStorage.removeItem(getProfileStorageKey(pid));
      if (profileState.activeProfileId === pid) {
        profileState.activeProfileId = profileState.profiles[0]?.id || "default";
        saveProfilesState();
        state = loadInitialState();
        renderAll();
        renderProfilePill();
      } else {
        saveProfilesState();
      }
      renderLedgersList();
      showToast(`Ledger "${profile.name}" deleted`);
    }
  });
}

// PIN prompt form submit
const pinPromptForm = $("#pin-prompt-form");
if (pinPromptForm) {
  pinPromptForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = $("#pin-input-field")?.value?.trim();
    const target = profileState.profiles.find((p) => p.id === pendingSwitchProfileId);
    const errEl = $("#pin-error-msg");

    if (!target) {
      closeModal($("#pin-prompt-dialog"));
      return;
    }

    if (entered === target.pin) {
      if (errEl) errEl.classList.add("hidden");
      doSwitchProfile(pendingSwitchProfileId);
      pendingSwitchProfileId = null;
    } else {
      if (errEl) errEl.classList.remove("hidden");
      const inputEl = $("#pin-input-field");
      if (inputEl) {
        inputEl.value = "";
        inputEl.focus();
      }
      playChime("error");
    }
  });
}

// ----------------------------------------------------
// PWA INSTALL — Event Listeners
// ----------------------------------------------------

// Capture install prompt before it fires
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = $("#btn-install-app");
  if (installBtn) installBtn.style.display = ""; // show if was hidden
});

// Install button clicked
const btnInstallApp = $("#btn-install-app");
if (btnInstallApp) {
  btnInstallApp.addEventListener("click", async () => {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === "accepted") {
        showToast("App installed! Find it on your home screen.");
        deferredPwaPrompt = null;
      }
    } else {
      openModal($("#install-info-dialog"));
    }
  });
}

// When app is installed (standalone)
window.addEventListener("appinstalled", () => {
  deferredPwaPrompt = null;
  showToast("Hisab App installed successfully!");
});

// ----------------------------------------------------
// SERVICE WORKER REGISTRATION
// ----------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

// Initial boot
initTheme();
renderProfilePill();
renderAll();
