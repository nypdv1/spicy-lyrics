// Minimal CDP client over WebSocket for Spotify's embedded Chromium.
// Usage: bun run cdp.ts <command> [args...]

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const PORT = Number(process.env.CDP_PORT ?? 9222);

export async function listTargets(): Promise<CDPTarget[]> {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return (await res.json()) as CDPTarget[];
}

export class CDP {
  private ws!: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private listeners = new Map<string, Array<(p: any) => void>>();
  public sessionId: string | undefined;

  static async connectToPage(urlMatch = "xpui.app.spotify.com"): Promise<CDP> {
    const targets = await listTargets();
    const page = targets.find((t) => t.type === "page" && t.url.includes(urlMatch));
    if (!page) throw new Error(`No page target matching ${urlMatch}. Targets: ${JSON.stringify(targets.map(t => [t.type, t.url]))}`);
    const cdp = new CDP();
    await cdp.connect(page.webSocketDebuggerUrl);
    return cdp;
  }

  async connect(wsUrl: string): Promise<void> {
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        const ls = this.listeners.get(msg.method);
        if (ls) for (const l of ls) l(msg.params);
        const all = this.listeners.get("*");
        if (all) for (const l of all) l(msg);
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (e) => reject(e));
    });
  }

  send<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
    });
  }

  on(method: string, cb: (params: any) => void): void {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method)!.push(cb);
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send<{ result: { value: T; subtype?: string }; exceptionDetails?: any }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }
    );
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  }

  close(): void {
    try { this.ws.close(); } catch {}
  }
}

// ---- CLI ----
if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "eval") {
    const cdp = await CDP.connectToPage();
    const result = await cdp.evaluate(args.join(" "));
    console.log(JSON.stringify(result, null, 2));
    cdp.close();
    process.exit(0);
  } else if (cmd === "targets") {
    console.log(JSON.stringify(await listTargets(), null, 2));
    process.exit(0);
  } else {
    console.log("usage: bun run cdp.ts <eval <expr> | targets>");
    process.exit(1);
  }
}
