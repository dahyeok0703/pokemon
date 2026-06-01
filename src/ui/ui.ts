const logEl = () => document.getElementById("log")!;
const actEl = () => document.getElementById("actions")!;
const statEl = () => document.getElementById("status")!;

export function clearLog(): void { logEl().innerHTML = ""; }

export function print(text = "", cls?: string): void {
  const d = document.createElement("div");
  d.className = "line" + (cls ? " " + cls : "");
  d.textContent = text;
  logEl().appendChild(d);
  logEl().scrollTop = logEl().scrollHeight;
}
export function printHtml(html: string, cls?: string): void {
  const d = document.createElement("div");
  d.className = "line" + (cls ? " " + cls : "");
  d.innerHTML = html;
  logEl().appendChild(d);
  logEl().scrollTop = logEl().scrollHeight;
}
export function printLines(lines: { text: string; cls?: string }[]): void {
  for (const l of lines) print(l.text, l.cls);
}
export function head(text: string): void { print(text, "head"); }

export interface Btn { label: string; on: () => void; primary?: boolean; disabled?: boolean; }
export function setActions(btns: Btn[]): void {
  const a = actEl();
  a.innerHTML = "";
  for (const b of btns) {
    const el = document.createElement("button");
    el.className = "act" + (b.primary ? " primary" : "");
    el.textContent = b.label;
    el.disabled = !!b.disabled;
    el.onclick = b.on;
    a.appendChild(el);
  }
}

export function inputPrompt(placeholder: string, onSubmit: (v: string) => void, btnLabel = "확인"): void {
  const a = actEl();
  a.innerHTML = "";
  const row = document.createElement("div");
  row.className = "input-row";
  const inp = document.createElement("input");
  inp.placeholder = placeholder;
  const btn = document.createElement("button");
  btn.className = "act primary";
  btn.textContent = btnLabel;
  const submit = () => { const v = inp.value.trim(); if (v) onSubmit(v); };
  btn.onclick = submit;
  inp.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  row.appendChild(inp); row.appendChild(btn);
  a.appendChild(row);
  inp.focus();
}

export function setStatus(text: string): void { statEl().textContent = text; }

export function hpBarHtml(cur: number, max: number): string {
  const pct = Math.max(0, Math.round((cur / max) * 100));
  const cls = pct <= 20 ? "low" : pct <= 50 ? "mid" : "";
  return `<span class="hpbar ${cls}"><i style="width:${pct}%"></i></span> ${cur}/${max}`;
}
