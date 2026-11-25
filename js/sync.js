// Sign-in and sync through Supabase (P2).
//
// The device copy (localStorage) is always written first, so the planner works
// offline. When signed in and online, the device copy and the server copy are
// merged: for each lesson note, each task and the setup as a whole, the most
// recent edit wins. Demo data is never uploaded.

const sync = {
  client: null,
  user: null,
  status: "off", // off | signed-out | syncing | synced | offline | error
  lastSynced: null,
  timer: null,
  running: false,
  again: false,
};

const syncConfigured = () => !!(window.PLANNER_CONFIG && PLANNER_CONFIG.supabaseUrl && PLANNER_CONFIG.supabaseKey && window.supabase);

function initSync() {
  if (!syncConfigured()) { sync.status = "off"; return; }
  sync.client = window.supabase.createClient(PLANNER_CONFIG.supabaseUrl, PLANNER_CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  sync.status = "signed-out";
  sync.client.auth.onAuthStateChange((event, session) => {
    const was = sync.user && sync.user.id;
    sync.user = session ? session.user : null;
    if (event === "PASSWORD_RECOVERY") { go("#/account/new-password"); return; }
    if (!sync.user) { sync.status = "signed-out"; renderBanner(); if (location.hash.startsWith("#/account")) renderAccount(); return; }
    if (sync.user.id !== was) setTimeout(syncNow, 0);
  });
  window.addEventListener("online", () => syncNow());
  window.addEventListener("offline", () => { if (sync.user) { sync.status = "offline"; renderBanner(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
}

// Called by saveState after every local save.
function scheduleSync() {
  if (!sync.user) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(syncNow, 1500);
}

// ---------- merging ----------
const newer = (a, b) => ((a && a.t) || 0) >= ((b && b.t) || 0) ? a : b;

function mergeStates(local, remote) {
  const out = { ...freshState() };
  const lt = (local.stamps && local.stamps.setup) || 0;
  const rt = (remote.stamps && remote.stamps.setup) || 0;
  const setupFrom = rt > lt ? remote : local;
  out.mode = setupFrom.mode;
  out.setup = setupFrom.setup;
  out.colours = setupFrom.colours || {};
  out.stamps = { ...(local.stamps || {}), ...(remote.stamps || {}), setup: Math.max(lt, rt) };

  out.notes = { ...(remote.notes || {}) };
  for (const [k, v] of Object.entries(local.notes || {})) out.notes[k] = out.notes[k] ? newer(v, out.notes[k]) : v;

  const todos = new Map();
  for (const t of remote.todos || []) todos.set(String(t.id), t);
  for (const t of local.todos || []) { const r = todos.get(String(t.id)); todos.set(String(t.id), r ? newer(t, r) : t); }
  out.todos = [...todos.values()];
  out.savedAt = local.savedAt;
  return out;
}

const fingerprint = (s) => JSON.stringify([s.mode, s.setup, s.colours, s.notes, s.todos]);

// ---------- syncing ----------
async function syncNow() {
  if (!sync.client || !sync.user) return;
  if (!navigator.onLine) { sync.status = "offline"; renderBanner(); return; }
  if (sync.running) { sync.again = true; return; }
  sync.running = true;
  sync.status = "syncing";
  renderBanner();
  try {
    const { data: row, error } = await sync.client.from("planner_state").select("data").eq("user_id", sync.user.id).maybeSingle();
    if (error) throw error;
    const remote = row && row.data;
    const before = fingerprint(state);
    let next;
    if (!remote) next = state;
    else if (state.mode !== "mine") next = { ...freshState(), ...remote, savedAt: state.savedAt }; // a new or demo device takes the server copy
    else next = mergeStates(state, remote);

    if (next.mode === "mine") {
      const payload = { ...next };
      delete payload.savedAt;
      if (!remote || fingerprint(remote) !== fingerprint(next)) {
        const { error: upErr } = await sync.client.from("planner_state").upsert({ user_id: sync.user.id, data: payload, updated_at: new Date().toISOString() });
        if (upErr) throw upErr;
      }
    }
    if (fingerprint(next) !== before) {
      state = next;
      saveState(state, { quiet: true });
      if (isTyping()) sync.pendingRender = true; else route();
    }
    sync.status = "synced";
    sync.lastSynced = new Date();
    sync.lastError = "";
  } catch (err) {
    console.warn("Sync failed", err);
    sync.status = navigator.onLine ? "error" : "offline";
    sync.lastError = [err && err.code, err && err.message].filter(Boolean).join(": ") || String(err);
  } finally {
    sync.running = false;
    renderBanner();
    if (location.hash.startsWith("#/account") && !isTyping()) renderAccount();
    if (sync.again) { sync.again = false; scheduleSync(); }
  }
}

// Don't redraw the page under someone who is part-way through typing.
function isTyping() {
  const a = document.activeElement;
  return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "file", "color"].includes(a.type))) && a.value !== "";
}
document.addEventListener("focusout", () => {
  if (!sync.pendingRender) return;
  setTimeout(() => { if (sync.pendingRender && !isTyping()) { sync.pendingRender = false; route(); } }, 0);
});

function syncLabel() {
  if (sync.status === "off") return "";
  if (sync.status === "signed-out") return "Not signed in";
  if (sync.status === "syncing") return "Syncing…";
  if (sync.status === "offline") return "Offline: changes will sync when you reconnect";
  if (sync.status === "error") return "Couldn't sync. Will try again";
  if (sync.status === "synced") return `Synced ${sync.lastSynced ? sync.lastSynced.toTimeString().slice(0, 5) : ""}`;
  return "";
}

// ---------- account screen ----------
let accountMsg = "";
let confirmWipe = false;

function renderAccount(sub) {
  if (!syncConfigured()) {
    view.innerHTML = `<header class="pagehead"><div><p class="eyebrow">Account</p><h1>Sign in and sync</h1></div></header>
      <div class="panel"><p>Syncing isn't switched on for this copy of the planner yet. Your planner is saved on this device.</p></div>`;
    setActiveNav("account");
    return;
  }
  const u = sync.user;
  let body;
  if (sub === "new-password") {
    body = `<section class="panel narrow"><h3>Choose a new password</h3>
      <form data-auth="new-password">
        <label class="field"><span>New password</span><input type="password" name="password" autocomplete="new-password" minlength="8" required /></label>
        <button class="btn">Save password</button>
      </form></section>`;
  } else if (!u) {
    body = `<section class="panel narrow">
      <h3>Sign in</h3>
      <p class="muted">Use the same email and password on your phone, laptop and school PC. Your planner syncs between them.</p>
      <form data-auth="sign-in">
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required /></label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" minlength="8" required /></label>
        <div class="btnrow">
          <button class="btn" name="go" value="in">Sign in</button>
          <button class="btn ghost" name="go" value="up">Create account</button>
          <button class="btn ghost" name="go" value="reset" formnovalidate>Forgot password</button>
        </div>
      </form>
      <p class="status">${esc(accountMsg)}</p>
    </section>`;
  } else {
    body = `<section class="panel narrow">
      <h3>Signed in</h3>
      <p>${esc(u.email)}</p>
      <p class="muted">${esc(syncLabel())}</p>
      ${sync.status === "error" && sync.lastError ? `<p class="small errtext">Reason: ${esc(sync.lastError)}</p>` : ""}
      <div class="btnrow">
        <button class="btn" data-action="sync-now">Sync now</button>
        <button class="btn ghost" data-action="sign-out">Sign out</button>
      </div>
      <p class="status">${esc(accountMsg)}</p>
    </section>
    <section class="panel narrow">
      <h3>Shared or school computer?</h3>
      <p class="muted">Signs you out and removes the planner from this browser. Your planner stays safe on your account.</p>
      <button class="btn ghost" data-action="sign-out-clear">Sign out and clear this device</button>
    </section>
    <section class="panel narrow">
      <h3>Delete your data</h3>
      <p class="muted">Removes your planner from the server. Copies on your devices stay until you clear them. Download a backup first from Setup.</p>
      <button class="btn ghost danger" data-action="wipe-server">${confirmWipe ? "Tap again to delete it from the server" : "Delete my planner from the server"}</button>
    </section>`;
  }
  view.innerHTML = `<header class="pagehead"><div><p class="eyebrow">Account</p><h1>Sign in and sync</h1></div></header>${body}`;
  setActiveNav("account");
}

async function handleAuthSubmit(form, submitter) {
  const fd = new FormData(form);
  const kind = form.dataset.auth;
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const redirect = location.origin + location.pathname;
  accountMsg = "Working…";
  try {
    if (kind === "new-password") {
      const { error } = await sync.client.auth.updateUser({ password });
      if (error) throw error;
      accountMsg = "Password changed.";
      go("#/account");
      return;
    }
    const goVal = submitter ? submitter.value : "in";
    if (goVal === "reset") {
      if (!email) { accountMsg = "Type your email first, then tap Forgot password."; renderAccount(); return; }
      const { error } = await sync.client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (error) throw error;
      accountMsg = "Check your email for a link to reset your password.";
    } else if (goVal === "up") {
      const { data, error } = await sync.client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      accountMsg = data.session ? "Account created. Syncing now." : "Account created. Check your email and tap the link to confirm, then sign in here.";
    } else {
      const { error } = await sync.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      accountMsg = "Signed in.";
    }
  } catch (err) {
    accountMsg = friendlyAuthError(err);
  }
  if (location.hash.startsWith("#/account")) renderAccount();
}

function friendlyAuthError(err) {
  const m = (err && err.message) || "";
  if (/invalid login/i.test(m)) return "That email and password don't match.";
  if (/email not confirmed/i.test(m)) return "Confirm your email first: check your inbox for the link.";
  if (/already registered/i.test(m)) return "There's already an account with that email. Sign in instead.";
  if (/rate limit/i.test(m)) return "Supabase has sent too many emails this hour. Try again later, or create the user in the Supabase dashboard with Auto Confirm ticked.";
  if (/failed to fetch|network/i.test(m)) return "Couldn't reach the server. Check your connection, or whether the school network blocks it.";
  return m || "Something went wrong. Try again.";
}

async function handleAccountAction(act) {
  if (act === "sync-now") { await syncNow(); accountMsg = sync.status === "synced" ? "Up to date." : syncLabel(); renderAccount(); return true; }
  if (act === "sign-out") { await sync.client.auth.signOut(); accountMsg = "Signed out. Your planner is still on this device."; renderAccount(); return true; }
  if (act === "sign-out-clear") {
    await syncNow();
    await sync.client.auth.signOut();
    clearState();
    state = freshState();
    accountMsg = "";
    go("#/today");
    toast("Signed out and cleared from this device.");
    return true;
  }
  if (act === "wipe-server") {
    if (!confirmWipe) {
      confirmWipe = true;
      renderAccount();
      setTimeout(() => { if (confirmWipe) { confirmWipe = false; if (location.hash.startsWith("#/account")) renderAccount(); } }, 5000);
      return true;
    }
    confirmWipe = false;
    const { error } = await sync.client.from("planner_state").delete().eq("user_id", sync.user.id);
    await sync.client.auth.signOut();
    accountMsg = error ? friendlyAuthError(error) : "Your planner was deleted from the server, and you're signed out.";
    renderAccount();
    return true;
  }
  return false;
}
