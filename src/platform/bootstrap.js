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
function renderLogin(msg) {
  app().innerHTML = shell(`
    <h2>sign in</h2>
    <p class="muted">Enter your work email. We'll send you a link to sign in; no password needed.</p>
    <form id="login" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <input id="email" type="email" required autocomplete="email" placeholder="you@thedelta.org" style="flex:1;min-width:240px;padding:9px 12px;font-size:15px">
      <button class="btn primary" type="submit">Email me a sign-in link</button>
    </form>
    ${GOOGLE ? `<div style="margin-top:12px"><button class="btn" id="google" type="button">Sign in with Google</button></div>` : ""}
    <p id="msg" class="small" style="margin-top:12px">${esc(msg || "")}</p>`);
  const form = document.getElementById("login"), m = document.getElementById("msg");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    form.querySelector("button").disabled = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    form.querySelector("button").disabled = false;
    m.textContent = error ? "The sign-in link couldn't be sent: " + error.message : "Check " + email + " for a sign-in link. You can close this tab.";
    m.style.color = error ? "#b21010" : "";
  });
  document.getElementById("google")?.addEventListener("click", () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));
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
  if (!session) {
    const err = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description") || new URLSearchParams(location.search).get("error_description");
    renderLogin(err ? "That sign-in link didn't work (" + err + "). Ask for a new one." : "");
    session = await new Promise(res => { const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) { data.subscription.unsubscribe(); res(s); } }); });
  }
  const me = await loadMe();
  if (!me || me.role === "pending") return renderPending(me || { email: session.user.email });
  supabase.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
  window.__loadXLSX = () => import("xlsx");
  installRuntime();
  await import("virtual:socent-app");
}
