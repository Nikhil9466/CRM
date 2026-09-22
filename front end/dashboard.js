"use strict";
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const currency = v => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v));
const compactMoney = v => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(Number(v));
const dateLabel = v => v ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
const state = { user: null, stages: [], members: [], view: "overview", page: 1, filters: {}, items: [], version: 0 };
const isAdmin = () => state.user?.role === "ADMIN";
function token() { return sessionStorage.getItem("token") || localStorage.getItem("token"); }
function logout() {
  for (const s of [localStorage, sessionStorage]) { s.removeItem("token"); s.removeItem("user"); }
  location.replace("login.html");
}
async function api(path, method = "GET", body) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("/api" + path, { method, signal: controller.signal,
      headers: { Authorization: "Bearer " + token(), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 401) { logout(); throw new Error("Please log in again."); }
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The server took too long. Please retry.");
    if (err instanceof TypeError) throw new Error("Cannot reach the server. Check your connection and refresh.");
    throw err;
  } finally { clearTimeout(timeout); }
}
function notice(message, error = false) {
  $("notice").textContent = message; $("notice").className = "notice" + (error ? " error" : ""); $("notice").hidden = false;
}
function theme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem("vb-theme", mode);
  $("theme").setAttribute("aria-label", "Switch to " + (mode === "dark" ? "light" : "dark") + " mode");
}
theme(localStorage.getItem("vb-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("theme").onclick = () => theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("logout").onclick = logout;
$("menu").onclick = () => {
  const open = $("sidebar").classList.toggle("open");
  $("menu").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", e => {
  if (!$("sidebar").contains(e.target) && !$("menu").contains(e.target)) { $("sidebar").classList.remove("open"); $("menu").setAttribute("aria-expanded", "false"); }
  if (!e.target.closest(".search-wrap")) $("searchResults").hidden = true;
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { $("searchResults").hidden = true; $("sidebar").classList.remove("open"); $("menu").setAttribute("aria-expanded", "false"); }
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { e.preventDefault(); $("globalSearch").focus(); }
});
function quick(type, title, subtitle) {
  return '<button class="quick" data-new="' + type + '"><span>+</span><div><strong>' + title + '</strong><small>' + subtitle + '</small></div><span>↗</span></button>';
}
function renderDashboard(d) {
  const kpis = [
    ["Total contacts", d.kpis.contacts, "♧", "People in your shared workspace"],
    ["Active deals", d.kpis.activeDeals, "▥", compactMoney(d.kpis.openValue) + " in open pipeline"],
    ["Won this month", compactMoney(d.kpis.wonThisMonth), "↗", "Value of deals won · UTC month"],
    ["Pending tasks", d.kpis.pendingTasks, "☑", d.dueCount + " due today"],
  ];
  const max = Math.max(1, ...d.monthly.map(m => m.count));
  const totalWins = d.monthly.reduce((n, m) => n + m.count, 0);
  const maxStage = Math.max(1, ...d.pipeline.map(s => s.count));
  const bars = d.monthly.map(m => '<div class="bar-column" title="' + esc(m.month + ": " + m.count + " deals, " + currency(m.value)) + '"><span class="bar-value">' + m.count + '</span><div class="bar" style="height:' + (m.count / max * 175) + 'px"></div></div>').join("");
  const labels = d.monthly.map(m => '<span>' + new Date(m.month + "-01T12:00:00Z").toLocaleDateString("en", { month: "short", timeZone: "UTC" }) + '</span>').join("");
  const pipeline = d.pipeline.map(s => '<div class="stage-row" data-kind="' + esc(s.kind) + '"><div class="stage-info"><span>' + esc(s.name) + '<small>' + s.count + ' deals</small></span><strong>' + esc(compactMoney(s.value)) + '</strong></div><div class="track"><span style="width:' + (s.count / maxStage * 100) + '%"></span></div></div>').join("");
  const tasks = d.dueTasks.map(t => '<label class="task-row"><input type="checkbox" data-complete="' + esc(t.id) + '" aria-label="' + esc("Complete " + t.title) + '"><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.contact?.name || t.deal?.title || "General task") + '</small></span></label>').join("");
  $("content").innerHTML = '<div class="kpis">' + kpis.map(k => '<article class="kpi"><div class="kpi-top"><span>' + k[0] + '</span><span class="kpi-icon">' + k[2] + '</span></div><p class="kpi-value">' + esc(k[1]) + '</p><p class="kpi-foot">' + esc(k[3]) + '</p></article>').join("") + '</div>' +
    '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>A little progress, every month</h2><small>Deals won over the last six months</small></div><span class="pill">Last 6 months</span></div><div class="chart" role="img" aria-label="' + esc(d.monthly.map(m => m.month + ": " + m.count + " wins").join("; ")) + '">' + bars + '</div><div class="chart-labels">' + labels + '</div>' +
    (totalWins ? '' : '<p class="chart-note">No wins yet. Move a deal to a Won-type stage to start tracking.</p>') +
    '<div class="chart-summary"><span><strong>' + totalWins + '</strong> deals won in this period</span><span>Monthly totals · UTC</span></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Your pipeline</h2><small>Every deal, a step closer</small></div><span class="pill">All time</span></div><div class="pipeline">' + (pipeline || '<p class="empty">Ask an admin to create pipeline stages.</p>') + '</div><a class="panel-link" href="#deals">Explore deals <span>↗</span></a></section></div>' +
    '<div class="bottom-grid"><section class="panel"><div class="panel-head"><div><h2>On your list today</h2><small>' + esc(dateLabel(today())) + ' · ' + d.dueCount + ' pending</small></div><span class="pill">Team tasks</span></div><div class="tasks-list">' +
    (tasks || '<div class="empty">A clear list for today.<br>Add a task when there’s a next step to take.</div>') +
    '</div><a class="panel-link" href="#tasks">View all tasks' + (d.dueCount > 8 ? ' · Showing first 8' : '') + ' ↗</a></section><section class="panel"><div class="panel-head"><div><h2>Make your next move</h2><small>Small actions. Stronger relationships.</small></div></div><div class="quick-grid">' +
    quick("contacts", "Add a contact", "Start a new relationship") + quick("deals", "Create a deal", "Turn a conversation into an opportunity") + quick("tasks", "Plan a task", "Give your next step a place") + '</div></section></div>';
}
const opt = (value, label, selected) => '<option value="' + esc(value) + '"' + (String(selected ?? "") === String(value) ? " selected" : "") + '>' + esc(label) + '</option>';
function actionButtons(type, item) {
  return '<button class="text-button" data-edit="' + type + '" data-id="' + esc(item.id) + '">Edit</button>' +
    (isAdmin() ? '<button class="text-button danger" data-delete="' + type + '" data-id="' + esc(item.id) + '">Delete</button>' : "");
}
function filtersHtml(type) {
  const f = state.filters;
  let html = '<form id="filtersForm" class="filters"><label>Search<input name="q" placeholder="' + (type === "contacts" ? 'Name, email or phone' : 'Title') + '" value="' + esc(f.q) + '"></label>';
  if (type === "contacts") html += '<label>Organisation / company<input name="company" value="' + esc(f.company) + '" placeholder="Any company"></label><label>Added from<input type="date" name="from" value="' + esc(f.from) + '"></label><label>Added through<input type="date" name="to" value="' + esc(f.to) + '"></label>';
  if (type === "deals") html += '<label>Pipeline stage<select name="stageId">' + opt("", "All stages", f.stageId) + state.stages.map(s => opt(s.id, s.name, f.stageId)).join("") + '</select></label>';
  if (type === "tasks") html += '<label>Status<select name="completed">' + opt("", "All tasks", f.completed) + opt("false", "Pending", f.completed) + opt("true", "Completed", f.completed) + '</select></label>';
  const sorts = type === "contacts" ? [["createdAt", "Date added"], ["name", "Name"], ["company", "Company"]] : type === "deals" ? [["createdAt", "Date added"], ["value", "Value"], ["expectedCloseDate", "Close date"]] : [["createdAt", "Date added"], ["dueDate", "Due date"]];
  html += '<label>Sort by<select name="sort">' + sorts.map(s => opt(s[0], s[1], f.sort || "createdAt")).join("") + '</select></label><label>Order<select name="direction">' + opt("desc", "Descending", f.direction || "desc") + opt("asc", "Ascending", f.direction) + '</select></label><button class="button" type="submit">Apply</button><button class="text-button" type="button" id="clearFilters">Clear</button></form>';
  return html;
}
function renderList(type, data) {
  state.items = data.items;
  const headers = type === "contacts" ? ["Contact", "Company", "Phone", "Assigned to", "Added", ""] : type === "deals" ? ["Deal", "Contact", "Value", "Stage", "Expected close", ""] : ["Task", "Linked record", "Due date", "Status", ""];
  const rows = data.items.map(item => {
    let cells;
    if (type === "contacts") cells = ['<strong>' + esc(item.name) + '</strong><small>' + esc(item.email || "No email") + '</small>', esc(item.company || "—"), esc(item.phone || "—"), esc(state.members.find(m => m.id === item.assigneeId)?.name || "Unassigned"), dateLabel(item.createdAt)];
    else if (type === "deals") cells = ['<strong>' + esc(item.title) + '</strong>', esc(item.contact.name), esc(currency(item.value)), '<select aria-label="' + esc("Stage for " + item.title) + '" data-stage="' + esc(item.id) + '">' + state.stages.map(s => opt(s.id, s.name, item.stageId)).join("") + '</select>', dateLabel(item.expectedCloseDate)];
    else cells = ['<strong>' + esc(item.title) + '</strong>', esc(item.contact?.name || item.deal?.title || "—"), dateLabel(item.dueDate), '<label class="check-line"><input type="checkbox" data-complete="' + esc(item.id) + '"' + (item.completed ? " checked" : "") + ' aria-label="' + esc("Complete " + item.title) + '"><span>' + (item.completed ? "Complete" : "Pending") + '</span></label>'];
    return '<tr>' + [...cells, actionButtons(type, item)].map(c => '<td>' + c + '</td>').join("") + '</tr>';
  }).join("");
  $("content").innerHTML = '<section class="panel">' + filtersHtml(type) + '<div class="table-wrap"><table><thead><tr>' + headers.map(h => '<th scope="col">' + h + '</th>').join("") + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (rows ? '' : '<div class="empty">No ' + type + ' found.<br>Add a record or try different filters.</div>') +
    '<div class="pager"><span>' + data.total + ' records · Page ' + data.page + ' of ' + Math.max(1, Math.ceil(data.total / data.pageSize)) + '</span><div><button class="button" id="prevPage"' + (data.page <= 1 ? " disabled" : "") + '>Previous</button><button class="button" id="nextPage"' + (data.page * data.pageSize >= data.total ? " disabled" : "") + '>Next</button></div></div></section>';
  $("filtersForm").onsubmit = e => { e.preventDefault(); state.filters = Object.fromEntries(new FormData(e.target)); state.page = 1; loadView(); };
  $("clearFilters").onclick = () => { state.filters = {}; state.page = 1; loadView(); };
  $("prevPage").onclick = () => { state.page--; loadView(); };
  $("nextPage").onclick = () => { state.page++; loadView(); };
}
function renderSettings() {
  const members = state.members.map(m => '<tr><td><strong>' + esc(m.name) + '</strong><small>' + esc(m.email) + '</small></td><td>' + esc(m.role) + '</td><td><span class="badge">' + (m.active ? "Active" : "Inactive") + '</span></td><td>' +
    (m.id === state.user.id ? '<small>Your account</small>' : '<button class="text-button" data-role="' + esc(m.id) + '">' + (m.role === "ADMIN" ? "Make user" : "Make admin") + '</button><button class="text-button danger" data-active="' + esc(m.id) + '">' + (m.active ? "Deactivate" : "Activate") + '</button>') + '</td></tr>').join("");
  const stages = state.stages.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.kind) + '</td><td>' + s.position + '</td><td>' + actionButtons("stages", s) + '</td></tr>').join("");
  $("content").innerHTML = '<div class="settings-grid"><section class="panel"><div class="panel-head"><div><h2>Your team</h2><small>Admins manage users, assignments, stages and permanent deletions.</small></div><button class="button primary" data-new="members">+ Add member</button></div><div class="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + members + '</tbody></table></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Pipeline stages</h2><small>Names and order are editable. Outcome types stay fixed to protect reports.</small></div><button class="button" data-new="stages">+ Add stage</button></div><div class="table-wrap"><table><thead><tr><th>Stage</th><th>Outcome</th><th>Position</th><th>Actions</th></tr></thead><tbody>' + stages + '</tbody></table></div></section></div>';
}
async function loadView() {
  const version = ++state.version;
  $("refresh").disabled = true;
  $("syncStatus").textContent = "Syncing with server…";
  try {
    if (state.view === "overview") {
      const data = await api("/dashboard?today=" + today()); if (version !== state.version) return;
      renderDashboard(data);
    } else if (state.view === "settings") {
      if (!isAdmin()) throw new Error("Administrator permission required.");
      const [members, stages] = await Promise.all([api("/members"), api("/stages")]);
      if (version !== state.version) return;
      state.members = members; state.stages = stages; renderSettings();
    } else {
      const params = new URLSearchParams({ ...state.filters, page: state.page });
      const data = await api("/" + state.view + "?" + params); if (version !== state.version) return;
      renderList(state.view, data);
    }
    $("syncStatus").textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    if (version !== state.version) return;
    notice(err.message, true);
    $("syncStatus").textContent = "Not synced — refresh to retry";
    $("content").innerHTML = '<div class="panel empty">We couldn’t load this view. Your saved data has not been changed.<br><button class="button" id="retryView">Retry</button></div>';
    $("retryView").onclick = loadView;
  } finally { if (version === state.version) $("refresh").disabled = false; }
}
function navigate() {
  const view = location.hash.slice(1) || "overview";
  state.view = ["overview", "contacts", "deals", "tasks", ...(isAdmin() ? ["settings"] : [])].includes(view) ? view : "overview";
  state.filters = {}; state.page = 1;
  $("sidebar").classList.remove("open"); $("menu").setAttribute("aria-expanded", "false");
  document.querySelectorAll("[data-view]").forEach(a => { a.classList.toggle("active", a.dataset.view === state.view); if (a.dataset.view === state.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const labels = { overview: "Overview", contacts: "Contacts", deals: "Deals", tasks: "Tasks", settings: "Team & settings" };
  $("crumb").textContent = labels[state.view]; document.title = labels[state.view] + " — Virtual Binz";
  $("pageTitle").textContent = state.view === "overview" ? "Hello, " + state.user.name.split(" ")[0] + "." : labels[state.view];
  $("subtitle").textContent = ({ overview: "Here’s where things stand. Let’s keep them moving.", contacts: "Good relationships start with knowing your people.", deals: "Every conversation is an opportunity to move forward.", tasks: "A clear next step for every relationship.", settings: "Keep your workspace organised and your team in control." })[state.view];
  $("eyebrow").textContent = state.view === "overview" ? "YOUR WORKSPACE AT A GLANCE" : "YOUR SHARED WORKSPACE";
  $("add").textContent = ({ overview: "+ New deal", contacts: "+ Add contact", deals: "+ New deal", tasks: "+ Add task", settings: "+ Add member" })[state.view];
  $("content").innerHTML = '<div class="empty panel">Loading…</div>';
  loadView();
}
$("refresh").onclick = async () => {
  $("notice").hidden = true;
  try { [state.stages, state.members] = await Promise.all([api("/stages"), api("/members")]); await loadView(); } catch (e) { notice(e.message, true); }
};
$("add").onclick = () => openEditor(state.view === "overview" ? "deals" : state.view === "settings" ? "members" : state.view);
const field = (name, label, value = "", type = "text", extra = "") => '<label>' + label + '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '" ' + extra + '></label>';
const select = (name, label, options, extra = "") => '<label>' + label + '<select name="' + name + '" ' + extra + '>' + options + '</select></label>';
let editing = null;
async function allChoices(type) {
  // Fetch every paginated choice; never silently hide records after the first page.
  let page = 1, all = [];
  while (true) {
    const data = await api("/" + type + "?page=" + page + "&sort=" + (type === "contacts" ? "name" : "title") + "&direction=asc");
    all.push(...data.items);
    if (page * data.pageSize >= data.total) return all;
    page++;
  }
}
let openingEditor = false;
async function openEditor(type, record) {
  if (openingEditor) return;
  openingEditor = true;
  try {
    const item = record || {};
    let html = "";
    if (type === "contacts") {
      html = field("name", "Full name", item.name, "text", 'required maxlength="120"') + field("email", "Email", item.email, "email", 'maxlength="254"') + field("phone", "Phone", item.phone, "tel", 'maxlength="30"') + field("company", "Organisation / company", item.company, "text", 'maxlength="120"') +
        select("assigneeId", "Assigned to", opt("", "Unassigned", item.assigneeId) + state.members.filter(m => m.active || m.id === item.assigneeId).map(m => opt(m.id, m.name, item.assigneeId)).join(""), isAdmin() ? "" : "disabled");
    } else if (type === "deals") {
      const contacts = await allChoices("contacts");
      if (!contacts.length) { notice("Add a contact first — every deal must belong to someone."); return; }
      if (!state.stages.length) { notice("Ask an administrator to add a pipeline stage."); return; }
      html = field("title", "Deal title", item.title, "text", 'required maxlength="160"') +
        select("contactId", "Contact", contacts.map(c => opt(c.id, c.name, item.contactId)).join(""), "required") +
        select("stageId", "Stage", state.stages.map(s => opt(s.id, s.name, item.stageId)).join(""), "required") +
        field("value", "Value (₹)", item.value ?? "0", "number", 'required min="0" max="999999999999.99" step="0.01"') +
        field("expectedCloseDate", "Expected close date", item.expectedCloseDate?.slice(0, 10), "date");
    } else if (type === "tasks") {
      const [contacts, deals] = await Promise.all([allChoices("contacts"), allChoices("deals")]);
      html = field("title", "Task title", item.title, "text", 'required maxlength="160"') + field("dueDate", "Due date", item.dueDate?.slice(0, 10), "date") +
        select("link", "Linked record", opt("", "No linked record", "") + contacts.map(c => opt("contact:" + c.id, "Contact · " + c.name, item.contactId ? "contact:" + item.contactId : "")).join("") + deals.map(d => opt("deal:" + d.id, "Deal · " + d.title, item.dealId ? "deal:" + item.dealId : "")).join("")) +
        select("completed", "Status", opt("false", "Pending", String(item.completed || false)) + opt("true", "Complete", String(item.completed || false)));
    } else if (type === "stages") {
      html = field("name", "Stage name", item.name, "text", 'required maxlength="60"') +
        select("kind", "Outcome type", ["OPEN", "WON", "LOST"].map(k => opt(k, k, item.kind || "OPEN")).join(""), item.id ? "disabled" : "") +
        field("position", "Display position", item.position ?? state.stages.length, "number", 'min="0" max="999" required step="1"') + '<small>Open stages count toward pipeline value. Won stages count toward monthly wins. A stage in use cannot be deleted.</small>';
    } else if (type === "members") {
      html = field("name", "Full name", "", "text", 'required maxlength="20"') + field("email", "Email", "", "email", "required") + field("phone", "Phone (10 digits)", "", "tel", 'required pattern="[0-9]{10}"') +
        field("password", "Initial password (12+ characters)", "", "password", 'required minlength="12" autocomplete="new-password"') +
        select("role", "Role", opt("USER", "Regular user", "USER") + opt("ADMIN", "Administrator")) + '<small>Share the initial password privately with this team member. They can change it from the account link on the login page.</small>';
    }
    editing = { type, item };
    $("editorTitle").textContent = (item.id ? "Edit " : "New ") + ({ contacts: "contact", deals: "deal", tasks: "task", stages: "stage", members: "team member" })[type];
    $("fields").innerHTML = html; $("formError").hidden = true; $("save").disabled = false;
    $("editor").showModal();
  } catch (e) { notice(e.message, true); } finally { openingEditor = false; }
}
$("closeEditor").onclick = $("cancelEditor").onclick = () => $("editor").close();
$("editorForm").onsubmit = async e => {
  e.preventDefault(); if (!editing) return;
  const { type, item } = editing, body = Object.fromEntries(new FormData(e.target));
  if (type === "contacts" && !isAdmin()) body.assigneeId = item.assigneeId || null;
  if (type === "tasks") {
    const [kind, id] = (body.link || "").split(":");
    body.contactId = kind === "contact" ? id : null; body.dealId = kind === "deal" ? id : null;
    body.completed = body.completed === "true"; delete body.link;
  }
  $("save").disabled = true; $("formError").hidden = true;
  try {
    await api("/" + type + (item.id ? "/" + item.id : ""), item.id ? "PATCH" : "POST", body);
    $("editor").close(); editing = null; notice("Saved successfully.");
    if (type === "stages") state.stages = await api("/stages");
    if (type === "members") state.members = await api("/members");
    await loadView();
  } catch (err) { $("formError").textContent = err.message; $("formError").hidden = false; }
  finally { $("save").disabled = false; }
};
$("content").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.new) return openEditor(b.dataset.new);
    if (b.dataset.edit) {
      const item = b.dataset.edit === "stages" ? state.stages.find(s => s.id === b.dataset.id) : await api("/" + b.dataset.edit + "/" + b.dataset.id);
      return openEditor(b.dataset.edit, item);
    }
    if (b.dataset.delete) {
      if (!confirm("Permanently delete this record? There is no recycle bin. Linked records must be removed or unlinked first.")) return;
      b.disabled = true;
      await api("/" + b.dataset.delete + "/" + b.dataset.id, "DELETE"); notice("Record permanently deleted.");
      if (b.dataset.delete === "stages") state.stages = await api("/stages");
      await loadView();
    }
    if (b.dataset.role || b.dataset.active) {
      const m = state.members.find(m => m.id === (b.dataset.role || b.dataset.active));
      if (!confirm("Change access for " + m.name + "?")) return;
      b.disabled = true;
      await api("/members/" + m.id, "PATCH", b.dataset.role ? { role: m.role === "ADMIN" ? "USER" : "ADMIN" } : { active: !m.active });
      notice("Team access updated."); await loadView();
    }
  } catch (err) { notice(err.message, true); b.disabled = false; }
});
$("content").addEventListener("change", async e => {
  const el = e.target;
  if (!el.dataset.complete && !el.dataset.stage) return;
  el.disabled = true;
  try {
    if (el.dataset.complete) await api("/tasks/" + el.dataset.complete, "PATCH", { completed: el.checked });
    else await api("/deals/" + el.dataset.stage, "PATCH", { stageId: el.value });
    notice("Saved successfully."); await loadView();
  } catch (err) {
    if (el.dataset.complete) el.checked = !el.checked;
    else el.value = state.items.find(d => d.id === el.dataset.stage)?.stageId || "";
    notice(err.message, true); el.disabled = false;
  }
});
let searchTimer, searchVersion = 0;
$("globalSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const version = ++searchVersion, q = $("globalSearch").value.trim();
  if (q.length < 2) { $("searchResults").hidden = true; return; }
  searchTimer = setTimeout(async () => {
    $("searchResults").hidden = false; $("searchResults").textContent = "Searching…";
    try {
      const data = await api("/search?q=" + encodeURIComponent(q));
      if (version !== searchVersion) return;
      $("searchResults").innerHTML = Object.entries(data).filter(([, items]) => items.length).map(([type, items]) => '<h3>' + esc(type.toUpperCase()) + ' · up to 10 matches</h3>' + items.map(item => '<button data-search-type="' + type + '" data-id="' + esc(item.id) + '">' + esc(item.name || item.title) + '</button>').join("")).join("") || '<p class="empty">No matching records.</p>';
    } catch (err) { if (version === searchVersion) $("searchResults").textContent = err.message; }
  }, 250);
});
$("searchResults").onclick = async e => {
  const b = e.target.closest("[data-search-type]"); if (!b) return;
  $("searchResults").hidden = true;
  try { await openEditor(b.dataset.searchType, await api("/" + b.dataset.searchType + "/" + b.dataset.id)); } catch (err) { notice(err.message, true); }
};
async function init() {
  if (!token()) return logout();
  try {
    [state.user, state.stages, state.members] = await Promise.all([api("/me"), api("/stages"), api("/members")]);
    $("userName").textContent = state.user.name; $("userRole").textContent = state.user.role === "ADMIN" ? "Administrator" : "Team member";
    $("workspaceName").textContent = state.user.orgId;
    const initials = state.user.name.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
    $("avatar").textContent = $("headerAvatar").textContent = initials;
    $("settingsNav").hidden = !isAdmin(); window.addEventListener("hashchange", navigate); navigate();
  } catch (err) { notice(err.message, true); $("content").innerHTML = '<div class="panel empty">Could not open your workspace. <button class="button" id="retryInit">Retry</button></div>'; $("retryInit").onclick = init; }
}
init();
