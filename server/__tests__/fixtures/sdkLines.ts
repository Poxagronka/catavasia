/**
 * Agent SDK messages as stream-json lines, in the shapes the installed CLI
 * 2.1.292 sent through the SDK (a haiku turn that read a PNG, 2026-10-07).
 */

/** The 8x8 red PNG the probe read. */
export const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC';

const line = (record: Record<string, unknown>) => JSON.stringify({ session_id: 's1', ...record });

export const init = (model = 'claude-haiku-4-5-20251001') =>
  line({ type: 'system', subtype: 'init', model, permissionMode: 'auto', apiKeySource: 'none' });

const usage = { input_tokens: 10, cache_creation_input_tokens: 20899, cache_read_input_tokens: 0 };

const assistant = (block: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  line({
    type: 'assistant',
    message: { model: 'claude-haiku-4-5-20251001', id: 'msg_1', content: [block], usage },
    parent_tool_use_id: null,
    ...extra,
  });

export const thinking = (ms: number) =>
  assistant({ type: 'thinking', thinking: '', signature: 'sig' }, { thinking_duration_ms: ms });

export const text = (t: string) => assistant({ type: 'text', text: t });

export const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  assistant({ type: 'tool_use', id, name, input, caller: { type: 'direct' } });

export const toolResult = (
  id: string,
  content: string | Array<Record<string, unknown>>,
  isError = false,
  parent: string | null = null,
) =>
  line({
    type: 'user',
    message: {
      role: 'user',
      content: [
        { tool_use_id: id, type: 'tool_result', content, ...(isError ? { is_error: true } : {}) },
      ],
    },
    parent_tool_use_id: parent,
  });

export const imageBlock = (data = RED_PNG) => ({
  type: 'image',
  source: { type: 'base64', data, media_type: 'image/png' },
});

/** Reset times far ahead, so the windows stay live in tests. */
export const FIVE_HOUR_RESET = 4102444800;
export const WEEKLY_RESET = 4103049600;

export const rateLimit = (fiveHour = 0.01, weekly = 0.61) =>
  line({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed',
      resetsAt: FIVE_HOUR_RESET,
      rateLimitType: 'five_hour',
      overageStatus: 'rejected',
      isUsingOverage: false,
      unifiedWindows: {
        five_hour: { utilization: fiveHour, resetsAt: FIVE_HOUR_RESET },
        seven_day: { utilization: weekly, resetsAt: WEEKLY_RESET },
      },
    },
  });

export const result = (contextWindow = 200000, model = 'claude-haiku-4-5-20251001') =>
  line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Red.',
    total_cost_usd: 0.05,
    usage: { input_tokens: 18, cache_creation_input_tokens: 21115, cache_read_input_tokens: 20899 },
    modelUsage: { [model]: { inputTokens: 932, contextWindow, maxOutputTokens: 32000 } },
  });
