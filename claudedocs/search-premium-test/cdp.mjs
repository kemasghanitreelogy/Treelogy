/* Klien CDP minimal — cukup untuk menavigasi dan mengeksekusi JS. */
import { spawn } from 'node:child_process';
const CHROME = '/Users/kemasghani/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export async function launch(port = 9333, profile = '/tmp/cdp-treelogy') {
  const p = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--window-size=430,900', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  return p;
}
export async function attach(port = 9333) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(res => { ws.onopen = res; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, m => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    send, ws,
    async goto(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 80; i++) {
        const r = await this.eval('document.readyState');
        if (r === 'complete') return;
        await new Promise(r2 => setTimeout(r2, 250));
      }
    },
    async eval(expr, awaitPromise = true) {
      const r = await send('Runtime.evaluate', {
        expression: `(async () => { ${expr.includes('return') ? expr : 'return (' + expr + ')'} })()`,
        awaitPromise, returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r.result.value;
    },
    close() { ws.close(); },
  };
}
