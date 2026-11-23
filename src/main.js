import "./styles.css";
import { start } from "./platform/bootstrap.js";

start().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = '<main id="main"><div class="emptyhero" style="margin-top:40px"><h2>SocEnt 360 could not start</h2><p class="muted">Reload the page. If this keeps happening, check the browser console and the Supabase settings in README.</p></div></main>';
});
