// =============================================================
// vesperwind · Cloudflare Worker
// 提供 HTTP API + MCP Server (Streamable HTTP)
// 状态持久化:Durable Object
// =============================================================

import { ALL_ITEMS, VESPER_ITEMS, CEDAR_ITEMS } from '../src/sprites/clothing.js';

// =============================================================
// Durable Object:存储每个用户的双角色装扮 + 预设
// =============================================================
export class WardrobeDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getState() {
    let s = await this.state.storage.get('state');
    if (!s) {
      s = {
        vesper: {
          top: 'white_shirt',
          bottom: 'jeans',
          dress: null,
          shoes: 'canvas_white',
          accessory: 'choker_black',
          catEars: true,
          catTail: true,
        },
        cedar: {
          shirt: 'shirt_white',
          vest: 'vest_grey',
          jacket: null,
          tie: 'tie_red',
          bottom: 'trousers_grey',
          shoes: 'shoes_leather',
          glasses: 'round',
          handheld: 'chalk',
        },
        presets: {},
      };
      await this.state.storage.put('state', s);
    }
    return s;
  }

  async putState(s) {
    await this.state.storage.put('state', s);
    return s;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const s = await this.getState();

    if (path === '/state' && req.method === 'GET') {
      return Response.json(s);
    }

    if (path === '/equip' && req.method === 'POST') {
      const { character, itemId } = await req.json();
      const ITEMS = character === 'vesper' ? VESPER_ITEMS : CEDAR_ITEMS;
      const item = ITEMS[itemId];
      if (!item) return Response.json({ error: 'item not found' }, { status: 404 });

      if (item.layer === 'dress') {
        s[character].dress = s[character].dress === itemId ? null : itemId;
        if (s[character].dress) {
          s[character].top = null;
          s[character].bottom = null;
        }
      } else {
        if ((item.layer === 'top' || item.layer === 'bottom') && s[character].dress) {
          s[character].dress = null;
        }
        s[character][item.layer] = s[character][item.layer] === itemId ? null : itemId;
      }
      await this.putState(s);
      return Response.json({ ok: true, outfit: s[character] });
    }

    if (path === '/unequip' && req.method === 'POST') {
      const { character, slot } = await req.json();
      s[character][slot] = null;
      await this.putState(s);
      return Response.json({ ok: true, outfit: s[character] });
    }

    if (path === '/toggle' && req.method === 'POST') {
      const { character, key } = await req.json();
      s[character][key] = !s[character][key];
      await this.putState(s);
      return Response.json({ ok: true, outfit: s[character] });
    }

    if (path === '/preset/save' && req.method === 'POST') {
      const { character, name } = await req.json();
      const key = `${character}:${name}`;
      s.presets[key] = { ...s[character] };
      await this.putState(s);
      return Response.json({ ok: true, key });
    }

    if (path === '/preset/load' && req.method === 'POST') {
      const { character, name } = await req.json();
      const key = `${character}:${name}`;
      const p = s.presets[key];
      if (!p) return Response.json({ error: 'preset not found' }, { status: 404 });
      s[character] = { ...p };
      await this.putState(s);
      return Response.json({ ok: true, outfit: s[character] });
    }

    if (path === '/preset/list' && req.method === 'GET') {
      return Response.json({ presets: Object.keys(s.presets) });
    }

    return new Response('Not found', { status: 404 });
  }
}

// =============================================================
// MCP Server:实现 Streamable HTTP 协议
// 暴露工具:list_items / equip / unequip / toggle / get_state /
//          save_preset / load_preset / list_presets
// =============================================================

const MCP_TOOLS = [
  {
    name: 'list_items',
    description: '列出某个角色可装备的所有衣物。character: "vesper" | "cedar"',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', enum: ['vesper', 'cedar'] },
      },
      required: ['character'],
    },
  },
  {
    name: 'get_state',
    description: '获取双角色当前完整装扮和所有预设',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'equip',
    description: '给指定角色装备一件衣物。如果已装备同件则会卸下。',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', enum: ['vesper', 'cedar'] },
        item_id: { type: 'string', description: '衣物 ID,从 list_items 获取' },
      },
      required: ['character', 'item_id'],
    },
  },
  {
    name: 'unequip',
    description: '卸下指定槽位的衣物',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', enum: ['vesper', 'cedar'] },
        slot: { type: 'string', description: 'top/bottom/dress/shoes/jacket/vest/shirt/tie/handheld/accessory' },
      },
      required: ['character', 'slot'],
    },
  },
  {
    name: 'toggle_cat',
    description: '切换 Vesper 的猫耳或猫尾(布尔切换)',
    inputSchema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['catEars', 'catTail'] },
      },
      required: ['part'],
    },
  },
  {
    name: 'save_preset',
    description: '把当前装扮保存为命名预设',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', enum: ['vesper', 'cedar'] },
        name: { type: 'string' },
      },
      required: ['character', 'name'],
    },
  },
  {
    name: 'load_preset',
    description: '加载已保存的预设到角色',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', enum: ['vesper', 'cedar'] },
        name: { type: 'string' },
      },
      required: ['character', 'name'],
    },
  },
];

async function handleMcp(req, env) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json();
  const { jsonrpc, method, params, id } = body;

  // 用户标识(从 query 或 header):简化版用单租户
  const userId = req.headers.get('x-user-id') || 'default';
  const stub = env.WARDROBE.get(env.WARDROBE.idFromName(userId));

  const reply = (result) => Response.json({ jsonrpc: '2.0', id, result });
  const error = (msg, code = -32000) => Response.json({ jsonrpc: '2.0', id, error: { code, message: msg } });

  if (method === 'initialize') {
    return reply({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'vesperwind-mcp', version: '0.1.0' },
    });
  }

  if (method === 'tools/list') {
    return reply({ tools: MCP_TOOLS });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    const callDO = async (path, payload) => {
      const r = await stub.fetch(`http://do${path}`, {
        method: payload ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      return r.json();
    };

    try {
      switch (name) {
        case 'list_items': {
          const ITEMS = args.character === 'vesper' ? VESPER_ITEMS : CEDAR_ITEMS;
          const list = Object.entries(ITEMS).map(([id, it]) => ({
            id, name: it.name, layer: it.layer, note: it.note, swatch: it.swatch,
          }));
          return reply({ content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] });
        }
        case 'get_state': {
          const s = await callDO('/state');
          return reply({ content: [{ type: 'text', text: JSON.stringify(s, null, 2) }] });
        }
        case 'equip': {
          const r = await callDO('/equip', { character: args.character, itemId: args.item_id });
          return reply({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] });
        }
        case 'unequip': {
          const r = await callDO('/unequip', { character: args.character, slot: args.slot });
          return reply({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] });
        }
        case 'toggle_cat': {
          const r = await callDO('/toggle', { character: 'vesper', key: args.part });
          return reply({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] });
        }
        case 'save_preset': {
          const r = await callDO('/preset/save', { character: args.character, name: args.name });
          return reply({ content: [{ type: 'text', text: `Preset saved: ${r.key}` }] });
        }
        case 'load_preset': {
          const r = await callDO('/preset/load', { character: args.character, name: args.name });
          return reply({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] });
        }
        default:
          return error(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return error(`Tool error: ${e.message}`);
    }
  }

  return error(`Unknown method: ${method}`, -32601);
}

// =============================================================
// 主入口
// =============================================================
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    let res;

    // MCP endpoint
    if (path === '/mcp') {
      res = await handleMcp(req, env);
    }
    // HTTP API:转发到 Durable Object
    else if (path.startsWith('/api/')) {
      const userId = req.headers.get('x-user-id') || 'default';
      const stub = env.WARDROBE.get(env.WARDROBE.idFromName(userId));
      const subPath = path.replace('/api', '');
      res = await stub.fetch(`http://do${subPath}${url.search}`, req);
    }
    // 健康检查
    else if (path === '/' || path === '/health') {
      res = Response.json({
        name: 'vesperwind',
        version: '0.1.0',
        endpoints: {
          mcp: '/mcp (POST, JSON-RPC 2.0)',
          api: '/api/state, /api/equip, /api/preset/save, ...',
        },
      });
    } else {
      res = new Response('Not found', { status: 404 });
    }

    // 添加 CORS header
    const newHeaders = new Headers(res.headers);
    Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(res.body, { status: res.status, headers: newHeaders });
  },
};
