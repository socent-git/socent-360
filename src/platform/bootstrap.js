/* Start-up: sign in with Supabase Auth, check the person's role, then start the app. */
import { supabase, configured, loadMe, installRuntime } from "./supabase.js";

const GOOGLE = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === "true";
const app = () => document.getElementById("app");
const caret = `<svg viewBox="0 0 90 63" aria-hidden="true" width="30" height="22"><polygon points="30,0 60,0 90,63 69,63 45,22 21,63 0,63" fill="#b21010"/></svg>`;
const shell = inner => `
  <header class="top"><div class="dark"><div class="dark-in">
    <span class="brand">${caret}<span class="wm">the^delta</span><span class="app">SocEnt 360</span></span>
  </div></div></header>
  <main id="main"><div class="emptyhero" style="margin-top:40px">${inner}</div></main>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderNotConfigured() {
  app().innerHTML = shell(`<h2>set-up needed</h2><p class="muted">This copy of SocEnt 360 isn't connected to a database yet. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> to the environment (see README), then rebuild.</p>`);
}
/* Sign-in with email and password: sign in · create account · forgot password · set a new password */
const RESET_FLAG = "reset=1";
const friendly = m => /invalid login credentials/i.test(m) ? "That email and password don't match. Check them, or use “Forgot password”."
  : /email not confirmed/i.test(m) ? "Confirm your email first: open the confirmation link we sent you."
  : /already registered|already been registered|user already exists/i.test(m) ? "There is already an account with this email. Sign in, or use “Forgot password”."
  : /password should be at least|weak password|password is too short/i.test(m) ? "Choose a longer password (at least 8 characters)."
  : /rate limit|too many/i.test(m) ? "Too many attempts. Wait a few minutes and try again."
  : /invalid path|failed to fetch|network/i.test(m) ? "SocEnt 360 can't reach its database. An Admin should check the Supabase address in Vercel (see README)."
  : m;
function renderLogin(msg, mode = "signin") {
  const titles = { signin: "sign in", signup: "create your account", forgot: "reset your password" };
  const intro = { signin: "Sign in with your work email and password.", signup: "Use your work email. After you create your account, an Admin gives you access.", forgot: "Enter your work email and we'll send you a link to choose a new password." };
  const fields = mode === "signup"
    ? `<label class="lf">Your name<input id="name" type="text" required autocomplete="name"></label>
       <label class="lf">Work email<input id="email" type="email" required autocomplete="email" placeholder="you@thedelta.org"></label>
       <label class="lf">Password (at least 8 characters)<input id="pw" type="password" required minlength="8" autocomplete="new-password"></label>`
    : mode === "forgot"
      ? `<label class="lf">Work email<input id="email" type="email" required autocomplete="email"></label>`
      : `<label class="lf">Work email<input id="email" type="email" required autocomplete="email" placeholder="you@thedelta.org"></label>
         <label class="lf">Password<input id="pw" type="password" required autocomplete="current-password"></label>`;
  const btn = { signin: "Sign in", signup: "Create account", forgot: "Send reset link" }[mode];
  const links = mode === "signin"
    ? `<button type="button" class="linkish" data-mode="forgot">Forgot password?</button> · <button type="button" class="linkish" data-mode="signup">Create an account</button>`
    : `<button type="button" class="linkish" data-mode="signin">Back to sign in</button>`;
  app().innerHTML = shell(`
    <style>.lf{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6e7475;font-weight:600;margin-bottom:12px}.lf input{padding:9px 12px;font-size:15px;max-width:420px}</style>
    <h2>${titles[mode]}</h2>
    <p class="muted">${intro[mode]}</p>
    <form id="login" style="margin-top:14px">${fields}<button class="btn primary" type="submit">${btn}</button></form>
    ${GOOGLE && mode === "signin" ? `<div style="margin-top:12px"><button class="btn" id="google" type="button">Sign in with Google</button></div>` : ""}
    <p id="msg" class="small" style="margin-top:14px">${esc(msg || "")}</p>
    <p class="small" style="margin-top:6px">${links}</p>`);
  const form = document.getElementById("login"), m = document.getElementById("msg"), b = form.querySelector("button");
  const say = (text, bad) => { m.textContent = text; m.style.color = bad ? "#b21010" : ""; };
  document.querySelectorAll("[data-mode]").forEach(x => x.addEventListener("click", () => renderLogin("", x.dataset.mode)));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const pw = document.getElementById("pw")?.value || "";
    b.disabled = true; say(mode === "signin" ? "Signing in…" : "Please wait…");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else if (mode === "signup") {
        if (pw.length < 8) throw new Error("Password should be at least 8 characters");
        const name = document.getElementById("name").value.trim();
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { renderLogin("Account created. Open the confirmation email we sent to " + email + ", then sign in here.", "signin"); return; }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "?" + RESET_FLAG });
        if (error) throw error;
        say("If " + email + " has an account, a link to choose a new password is on its way. Check spam too.");
      }
    } catch (err) { say(friendly(err.message || String(err)), true); }
    finally { b.disabled = false; }
  });
  document.getElementById("google")?.addEventListener("click", () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));
}
function renderSetPassword() {
  return new Promise(resolve => {
    app().innerHTML = shell(`
      <h2>choose a new password</h2>
      <form id="pwf" style="margin-top:14px"><label class="lf" style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6e7475;font-weight:600;margin-bottom:12px">New password (at least 8 characters)
        <input id="pw" type="password" required minlength="8" autocomplete="new-password" style="padding:9px 12px;font-size:15px;max-width:420px"></label>
        <button class="btn primary" type="submit">Save password</button></form>
      <p id="msg" class="small" style="margin-top:14px"></p>`);
    const f = document.getElementById("pwf"), m = document.getElementById("msg");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const pw = document.getElementById("pw").value;
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { m.textContent = friendly(error.message); m.style.color = "#b21010"; return; }
      history.replaceState(null, "", location.pathname + location.hash);
      resolve();
    });
  });
}
function renderPending(me) {
  app().innerHTML = shell(`
    <h2>waiting for access</h2>
    <p>You're signed in as <b>${esc(me.email)}</b>, but an Admin hasn't given you access to SocEnt 360 yet.</p>
    <p class="muted">Ask an Admin to open Settings › Users and roles and choose your role. Then reload this page.</p>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="reload" type="button">Reload</button><button class="btn" id="out" type="button">Sign out</button></div>`);
  document.getElementById("reload").onclick = () => location.reload();
  document.getElementById("out").onclick = async () => { await supabase.auth.signOut(); location.reload(); };
}

export async function start() {
  if (!configured) return renderNotConfigured();
  app().innerHTML = shell(`<p class="muted">Loading SocEnt 360…</p>`);
  let { data: { session } } = await supabase.auth.getSession();
  if (session && location.search.includes(RESET_FLAG)) await renderSetPassword();
  if (!session) {
    const err = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description") || new URLSearchParams(location.search).get("error_description");
    renderLogin(err ? "That link didn't work (" + err + "). Request a new one." : "");
    session = await new Promise(res => { const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) { data.subscription.unsubscribe(); res(s); } }); });
  }
  const me = await loadMe();
  if (!me || me.role === "pending") return renderPending(me || { email: session.user.email });
  supabase.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
  window.__loadXLSX = () => import("xlsx");
  installRuntime();
  await import("virtual:socent-app");
}
