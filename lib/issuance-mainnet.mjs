import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

const ENDPOINT = 'https://mcp.dual.network/mcp';
const READS = new Set([
  'getWallet',
  'getOrganization',
  'getMyOrganizationRole',
  'listObjects',
  'getObject',
  'listTemplates',
  'getTemplate',
  'getNetworkFees',
  'getOrganizationBalance',
  'getNonce',
  'getActionLogs',
  'getObjectStateChanges',
  'listObjectAttributes',
]);
const WRITES = new Set(['executeAction']);
const MAX_BYTES = 1024 * 1024;
const PROTOCOL = '2025-03-26';
const SUPPORTED_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);

// The file is JSON {"secret":"..."}; it must be owned by the service user and
// inaccessible to group/other users. Never accept a URL or key from a request.
async function serviceSecret() {
  const path = process.env.DUAL_MAINNET_API_KEY_FILE;
  if (!path || !path.startsWith('/')) throw fault('Credential configuration unavailable');
  let f;
  try {
    f = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const s = await f.stat();
    if (
      !s.isFile() ||
      s.size > 16384 ||
      s.mode & 0o077 ||
      (typeof process.getuid === 'function' && s.uid !== process.getuid())
    )
      throw new Error();
    const parsed = JSON.parse(await f.readFile('utf8'));
    if (typeof parsed.secret !== 'string' || !parsed.secret || /[\r\n]/.test(parsed.secret))
      throw new Error();
    return parsed.secret;
  } catch {
    throw fault('Credential configuration unavailable');
  } finally {
    await f?.close();
  }
}
function fault(message, fields = {}) {
  return Object.assign(new Error(message), fields);
}
function providerFault(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const nested = e.error && typeof e.error === 'object' ? e.error : {};
  const status = nested.status ?? e.status ?? nested.statusCode ?? e.statusCode;
  const code = nested.code ?? e.code;
  const executed = nested.executed ?? e.executed;
  const message = nested.message ?? e.message;
  // Only retain a known stable refusal; arbitrary server text may contain secrets.
  const safe =
    message === 'action not allowed' ? message : 'Dual provider refused or failed the request';
  return fault(safe, {
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(Number.isInteger(code) ? { code } : {}),
    ...(typeof executed === 'boolean' ? { executed } : {}),
  });
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw fault('Invalid MCP response');
  }
}
function validResponse(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.jsonrpc !== '2.0')
    throw fault('Invalid MCP response envelope');
  if (!Object.hasOwn(value, 'id')) {
    if (
      typeof value.method !== 'string' ||
      Object.hasOwn(value, 'result') ||
      Object.hasOwn(value, 'error')
    )
      throw fault('Invalid MCP notification');
    return false;
  }
  if (value.id !== id || Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error'))
    throw fault('Invalid MCP response envelope');
  return true;
}
async function readBounded(response, id) {
  if (!response.body)
    return id === undefined
      ? null
      : (() => {
          throw fault('Invalid MCP response');
        })();
  const contentType = response.headers.get('content-type') || '';
  const isSse = /^text\/event-stream(?:\s*;|$)/i.test(contentType);
  if (id !== undefined && !isSse && !/^application\/json(?:\s*;|$)/i.test(contentType))
    throw fault('Invalid MCP response content type');
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    buffer = '',
    found;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        size += value.byteLength;
        if (size > MAX_BYTES) throw fault('MCP response exceeds size limit');
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) buffer += decoder.decode();
      if (isSse && id !== undefined) {
        // Process every complete event delivered in this chunk before returning,
        // so a duplicate or foreign response in the same batch fails closed.
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const lines = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''));
          if (!lines.length) continue;
          const payload = parseJson(lines.join('\n'));
          if (validResponse(payload, id)) {
            if (found) throw fault('Duplicate MCP response');
            found = payload;
          }
        }
        if (found) {
          await reader.cancel();
          return found;
        }
      }
      if (done) break;
    }
    if (id === undefined) {
      if (buffer.trim()) throw fault('Invalid MCP notification response');
      return null;
    }
    if (isSse) throw fault('Invalid MCP response envelope');
    const payload = parseJson(buffer);
    if (!validResponse(payload, id)) throw fault('Invalid MCP response envelope');
    return payload;
  } finally {
    reader.releaseLock();
  }
}
function unwrap(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw fault('Invalid MCP tool result');
  let data = result.structuredContent;
  if (data == null && Array.isArray(result.content)) {
    if (
      !result.content.length ||
      result.content.some((c) => c?.type !== 'text' || typeof c.text !== 'string')
    )
      throw fault('Invalid MCP tool result');
    data = parseJson(result.content.map((c) => c.text).join('\n'));
  }
  if (typeof data === 'string') data = parseJson(data);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw fault('Invalid MCP tool result');
  if (result.isError === true || data.ok === false || data.success === false || data.error)
    throw providerFault(data);
  if (data.success === true && Object.hasOwn(data, 'data')) data = data.data;
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw fault('Invalid MCP tool result');
  return data;
}

/** Injectable provider and fetch are for hermetic tests; production uses the fixed endpoint. */
export function createMainnetConnector({
  secretProvider = serviceSecret,
  fetch: request = globalThis.fetch,
  timeoutMs = 10000,
} = {}) {
  if (
    typeof secretProvider !== 'function' ||
    typeof request !== 'function' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw fault('Invalid connector configuration');
  let session,
    secret,
    nextId = 0,
    queue = Promise.resolve();
  async function post(method, params, id, sid, version) {
    let response, text;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await request(ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'x-api-key': secret,
          ...(sid ? { 'mcp-session-id': sid, 'mcp-protocol-version': version } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(id === undefined ? {} : { id }),
          method,
          params,
        }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw fault('MCP HTTP request failed', { status: response.status, transportHttp: true });
      text = await readBounded(response, id);
    } catch (e) {
      if (
        e?.transportHttp ||
        /^(Invalid MCP|Duplicate MCP|MCP response exceeds)/.test(e?.message || '')
      )
        throw e;
      throw fault(controller.signal.aborted ? 'MCP request timed out' : 'MCP request failed');
    } finally {
      clearTimeout(timer);
    }
    if (id === undefined) return response;
    const payload = text;
    if (payload.error) throw providerFault(payload.error);
    return { response, result: payload.result };
  }
  async function connect() {
    session = undefined;
    try {
      secret = await secretProvider();
    } catch {
      throw fault('Credential configuration unavailable');
    }
    if (typeof secret !== 'string' || !secret || /[\r\n]/.test(secret))
      throw fault('Credential configuration unavailable');
    const init = await post(
      'initialize',
      {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'dual-capture-service', version: '1.0.0' },
      },
      ++nextId,
    );
    const sid = init.response.headers.get('mcp-session-id');
    if (!sid || !init.result || !SUPPORTED_PROTOCOLS.has(init.result.protocolVersion))
      throw fault('Invalid MCP initialization');
    const version = init.result.protocolVersion;
    await post('notifications/initialized', {}, undefined, sid, version);
    const discovered = new Set();
    let cursor;
    const cursors = new Set();
    do {
      const { result } = await post('tools/list', cursor ? { cursor } : {}, ++nextId, sid, version);
      if (!result || !Array.isArray(result.tools)) throw fault('Invalid MCP tool list');
      for (const tool of result.tools) {
        if (!tool || typeof tool.name !== 'string' || discovered.has(tool.name))
          throw fault('Invalid MCP tool list');
        discovered.add(tool.name);
      }
      cursor = result.nextCursor;
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || cursors.size >= 20)
      )
        throw fault('Invalid MCP tool list');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    session = { sid, version, discovered };
  }
  async function invoke(name, args) {
    if (
      (!READS.has(name) && !WRITES.has(name)) ||
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args)
    )
      throw fault('Unsupported connector call');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!session) await connect();
        // Names are the canonical case-sensitive names exposed by Dual MainNet.
        if (!session.discovered.has(name)) throw fault('Required MCP tool unavailable');
        const { result } = await post(
          'tools/call',
          { name, arguments: args },
          ++nextId,
          session.sid,
          session.version,
        );
        return unwrap(result);
      } catch (e) {
        // A lost write response is always ambiguous. Only a read can reinitialize
        // on an explicit transport timeout or HTTP 404/408/429/502/503/504.
        const transient =
          e.message === 'MCP request timed out' ||
          (e.transportHttp === true && [404, 408, 429, 502, 503, 504].includes(e.status));
        if (WRITES.has(name) || attempt || !transient) throw e;
        session = undefined;
      }
    }
  }
  return (name, args) => {
    const result = queue.then(() => invoke(name, args));
    queue = result.catch(() => {});
    return result;
  };
}
