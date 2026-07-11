// AI provider integration. DeepSeek is OpenAI-compatible, so this also works with
// any OpenAI-style endpoint by changing AI_BASE_URL / AI_MODEL. The API key is read
// ONLY from the environment — never hardcode it.

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat';
const AI_KEY = () => process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || '';

export const aiEnabled = () => !!AI_KEY();

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  if (!aiEnabled()) throw new Error('AI is not configured (set DEEPSEEK_API_KEY)');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY()}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`AI provider error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

// Structured delay-risk report. Uses the model when configured to reason over the
// portfolio; otherwise returns a transparent heuristic score.
export type RiskRow = { project: string; probability: number; causes: string[]; recommendation: string };

export async function riskReport(
  projects: { id: string; name: string; st: string; prog: number; overdue: number; staleDays: number; critLate: number }[],
): Promise<{ rows: RiskRow[]; source: 'ai' | 'heuristic' }> {
  // heuristic baseline
  const heuristic = (): RiskRow[] => projects.map((p) => {
    let score = 0;
    if (p.st === 'bad') score += 55; else if (p.st === 'risk') score += 35;
    score += Math.min(30, p.overdue * 8);
    score += Math.min(15, p.critLate * 7);
    score += Math.min(15, Math.floor(p.staleDays / 3) * 3);
    score += Math.max(0, 20 - Math.floor(p.prog / 5));
    const probability = Math.max(3, Math.min(96, score));
    const causes: string[] = [];
    if (p.overdue) causes.push(`${p.overdue} overdue task${p.overdue > 1 ? 's' : ''}`);
    if (p.critLate) causes.push('critical-path task slipping');
    if (p.staleDays > 6) causes.push(`no update for ${p.staleDays} days`);
    if (p.prog < 30) causes.push('low completion vs. timeline');
    if (!causes.length) causes.push('on plan');
    return { project: p.name, probability, causes, recommendation: probability > 50 ? 'Re-baseline the critical path and reassign an owner to the slipping tasks.' : 'Keep monitoring; confirm the next milestone date with the owner.' };
  }).sort((a, b) => b.probability - a.probability);

  if (!aiEnabled()) return { rows: heuristic(), source: 'heuristic' };
  try {
    const sys = 'You are a delivery-risk analyst. Given projects with status, progress and signals, return STRICT JSON ' +
      '{"rows":[{"project":string,"probability":0-100 integer,"causes":[string],"recommendation":string}]} sorted by probability desc. Be concise.';
    const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(projects) }], { json: true, temperature: 0.2, maxTokens: 900 });
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.rows) && parsed.rows.length) return { rows: parsed.rows, source: 'ai' };
  } catch { /* fall through */ }
  return { rows: heuristic(), source: 'heuristic' };
}

// Parse a natural-language task request into structured fields, grounded in the
// user's real projects and members so names resolve correctly.
export async function parseTaskNL(
  text: string,
  ctx: { members: { id: string; name: string }[]; projects: { id: string; name: string }[]; todayISO: string },
) {
  const sys =
    `You extract task fields from natural language (English or Bahasa Indonesia). ` +
    `Today is ${ctx.todayISO}. Return STRICT JSON with keys: ` +
    `name (string), assigneeId (one of the member ids or null), dueISO (YYYY-MM-DD or null), ` +
    `priority (one of "urgent","high","med","low"), projectId (one of the project ids or null). ` +
    `Members: ${JSON.stringify(ctx.members)}. Projects: ${JSON.stringify(ctx.projects)}. ` +
    `Match assignee/project by name loosely. If unsure, use null.`;
  const raw = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: text }],
    { json: true, temperature: 0 },
  );
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
