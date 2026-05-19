import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PALETTE } from './sprites/palette.js';
import {
  VESPER_BODY,
  VESPER_HAIR_LONG,
  VESPER_FACE_DEFAULT,
  VESPER_CAT_EARS_FRAME0,
  VESPER_CAT_EARS_FRAME1,
  VESPER_CAT_EARS_FRAME2,
  VESPER_TAIL_FRAMES,
  CEDAR_BODY,
  CEDAR_FACE_DEFAULT,
  CEDAR_GLASSES_ROUND,
  CEDAR_GLASSES_SQUARE,
  SPRITE_W as W,
  SPRITE_H as H,
  EMPTY_ROW,
} from './sprites/characters.js';
import {
  VESPER_ITEMS,
  CEDAR_ITEMS,
  SLOT_LABELS,
} from './sprites/clothing.js';

const PIXEL = 6; // 每像素显示尺寸

// =============================================================
// 合成多层 grid 为最终像素数据
// =============================================================
function compose(layers) {
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const layer of layers) {
    if (!layer) continue;
    for (let r = 0; r < H; r++) {
      const row = layer[r] || EMPTY_ROW;
      for (let c = 0; c < W; c++) {
        const ch = row[c];
        if (ch && ch !== '.') grid[r][c] = ch;
      }
    }
  }
  return grid;
}

// =============================================================
// PixelChar:渲染一个像素角色(Canvas)
// 支持 breathing(整体上下 1px) + ears(3 帧) + tail(6 帧)
// =============================================================
function PixelChar({ character, outfit, scale = 1, animate = true }) {
  const canvasRef = useRef(null);
  const [earFrame, setEarFrame] = useState(0);
  const [tailFrame, setTailFrame] = useState(0);
  const [breath, setBreath] = useState(0);

  // 动画循环
  useEffect(() => {
    if (!animate) return;
    let raf;
    let lastEar = 0, lastTail = 0, lastBreath = 0;

    const tick = (t) => {
      // 耳朵:每 600ms 切一帧,带随机性
      if (t - lastEar > 500 + Math.random() * 400) {
        setEarFrame((f) => (f + 1) % 3);
        lastEar = t;
      }
      // 尾巴:每 180ms 切一帧
      if (t - lastTail > 180) {
        setTailFrame((f) => (f + 1) % 6);
        lastTail = t;
      }
      // 呼吸:正弦曲线,周期 2s
      const phase = (t / 2000) * Math.PI * 2;
      setBreath(Math.sin(phase) > 0 ? 0 : -1);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const px = PIXEL * scale;

    ctx.clearRect(0, 0, W * px, H * px);

    const isVesper = character === 'vesper';
    const ITEMS = isVesper ? VESPER_ITEMS : CEDAR_ITEMS;
    const layers = [];

    if (isVesper) {
      // 渲染顺序:身体 → 头发(长) → dress / (bottom + top) → accessory → 五官 → 猫耳 → 猫尾
      layers.push(VESPER_BODY);
      layers.push(VESPER_HAIR_LONG);

      // 鞋
      if (outfit.shoes) layers.push(ITEMS[outfit.shoes].grid);
      // dress 互斥 top+bottom
      if (outfit.dress) {
        layers.push(ITEMS[outfit.dress].grid);
      } else {
        if (outfit.bottom) layers.push(ITEMS[outfit.bottom].grid);
        if (outfit.top) layers.push(ITEMS[outfit.top].grid);
      }
      if (outfit.accessory) layers.push(ITEMS[outfit.accessory].grid);
      layers.push(VESPER_FACE_DEFAULT);

      // 猫耳(可拆)
      if (outfit.catEars) {
        const frames = [VESPER_CAT_EARS_FRAME0, VESPER_CAT_EARS_FRAME1, VESPER_CAT_EARS_FRAME2];
        layers.push(frames[earFrame]);
      }
      // 猫尾(可拆)
      if (outfit.catTail) {
        layers.push(VESPER_TAIL_FRAMES[tailFrame]);
      }
    } else {
      // Cedar
      layers.push(CEDAR_BODY);
      if (outfit.shoes) layers.push(ITEMS[outfit.shoes].grid);
      if (outfit.bottom) layers.push(ITEMS[outfit.bottom].grid);
      if (outfit.shirt) layers.push(ITEMS[outfit.shirt].grid);
      if (outfit.tie) layers.push(ITEMS[outfit.tie].grid);
      if (outfit.vest) layers.push(ITEMS[outfit.vest].grid);
      if (outfit.jacket) layers.push(ITEMS[outfit.jacket].grid);
      layers.push(CEDAR_FACE_DEFAULT);

      // 眼镜
      if (outfit.glasses === 'round') layers.push(CEDAR_GLASSES_ROUND);
      else if (outfit.glasses === 'square') layers.push(CEDAR_GLASSES_SQUARE);

      if (outfit.handheld) layers.push(ITEMS[outfit.handheld].grid);
    }

    const composed = compose(layers);

    // 绘制(应用呼吸偏移到躯干以上)
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = composed[r][c];
        if (ch === '.') continue;
        const color = PALETTE[ch];
        if (!color) continue;
        // 呼吸:头部和躯干上半微微上下浮动
        const yOffset = (animate && r < (isVesper ? 38 : 40)) ? breath : 0;
        ctx.fillStyle = color;
        ctx.fillRect(c * px, (r + yOffset) * px, px, px);
      }
    }
  }, [character, outfit, scale, earFrame, tailFrame, breath, animate]);

  const px = PIXEL * scale;
  return (
    <canvas
      ref={canvasRef}
      width={W * px}
      height={H * px}
      style={{
        imageRendering: 'pixelated',
        display: 'block',
      }}
    />
  );
}

// =============================================================
// ItemSwatch:衣物 thumbnail
// =============================================================
function ItemSwatch({ item }) {
  const canvasRef = useRef(null);
  const px = 3;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F4ECE0';
    ctx.fillRect(0, 0, W * px, H * px);
    for (let r = 0; r < H; r++) {
      const row = item.grid[r] || EMPTY_ROW;
      for (let c = 0; c < W; c++) {
        const ch = row[c];
        if (!ch || ch === '.') continue;
        const color = PALETTE[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }, [item]);
  return (
    <canvas
      ref={canvasRef}
      width={W * px}
      height={H * px}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}

// =============================================================
// 主组件
// =============================================================
export default function Vesperwind() {
  const [selected, setSelected] = useState('vesper');
  const [tab, setTab] = useState('clothing');

  const [vesper, setVesper] = useState({
    top: 'white_shirt',
    bottom: 'jeans',
    dress: null,
    shoes: 'canvas_white',
    accessory: 'choker_black',
    catEars: true,
    catTail: true,
  });

  const [cedar, setCedar] = useState({
    shirt: 'shirt_white',
    vest: 'vest_grey',
    jacket: null,
    tie: 'tie_red',
    bottom: 'trousers_grey',
    shoes: 'shoes_leather',
    glasses: 'round',
    handheld: 'chalk',
  });

  const [presets, setPresets] = useState({});

  const outfit = selected === 'vesper' ? vesper : cedar;
  const setOutfit = selected === 'vesper' ? setVesper : setCedar;

  // —— 装备/卸下 ——
  const equip = useCallback((itemId) => {
    const ITEMS = selected === 'vesper' ? VESPER_ITEMS : CEDAR_ITEMS;
    const item = ITEMS[itemId];
    if (!item) return;

    setOutfit((prev) => {
      const next = { ...prev };
      // dress 互斥 top + bottom
      if (item.layer === 'dress') {
        next.dress = next.dress === itemId ? null : itemId;
        if (next.dress) {
          next.top = null;
          next.bottom = null;
        }
        return next;
      }
      // 穿其他时如果有 dress,先脱掉
      if ((item.layer === 'top' || item.layer === 'bottom') && next.dress) {
        next.dress = null;
      }
      next[item.layer] = next[item.layer] === itemId ? null : itemId;
      return next;
    });
  }, [selected, setOutfit]);

  // —— 切换猫耳猫尾 ——
  const toggleCat = (slot) => {
    if (selected !== 'vesper') return;
    setVesper((p) => ({ ...p, [slot]: !p[slot] }));
  };

  // —— 切换眼镜 ——
  const cycleGlasses = () => {
    if (selected !== 'cedar') return;
    setCedar((p) => {
      const order = [null, 'round', 'square'];
      const i = order.indexOf(p.glasses);
      return { ...p, glasses: order[(i + 1) % order.length] };
    });
  };

  // —— 预设保存/加载 ——
  const savePreset = () => {
    const name = prompt('给这套搭配起个名字');
    if (!name) return;
    setPresets((p) => ({ ...p, [`${selected}:${name}`]: { ...outfit } }));
  };

  const loadPreset = (key) => {
    const p = presets[key];
    if (!p) return;
    setOutfit({ ...p });
  };

  // —— 当前 tab 下可见的衣物 ——
  const ITEMS_FOR_OWNER = selected === 'vesper' ? VESPER_ITEMS : CEDAR_ITEMS;
  const visibleItems = Object.entries(ITEMS_FOR_OWNER);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #F4ECE0 0%, #EDE2D0 60%, #E8DBC4 100%)',
        fontFamily: '"Cormorant Garamond", "Songti SC", serif',
        color: '#3E2A1B',
        padding: '24px 16px 48px',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=VT323&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 28,
            paddingBottom: 16,
            borderBottom: '2px dotted #A89479',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: '"Pixelify Sans", monospace',
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: '0.04em',
                margin: 0,
                color: '#3E2A1B',
                lineHeight: 1,
              }}
            >
              vesperwind
            </h1>
            <p style={{
              margin: '6px 0 0',
              fontSize: 14,
              fontStyle: 'italic',
              color: '#7B5A3F',
            }}>
              64×64 pixel · 双角色换装 · MCP-ready
            </p>
          </div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#7B5A3F', textAlign: 'right' }}>
            <div>VESPER · 174cm · 18-20</div>
            <div>CEDAR · 188cm · 40 · 数学教授</div>
          </div>
        </header>

        {/* 双人展台 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}>
          <CharCard
            label="Vesper"
            sublabel="深棕长发 · 猫耳 / 猫尾"
            outfit={vesper}
            character="vesper"
            selected={selected === 'vesper'}
            onSelect={() => setSelected('vesper')}
          />
          <CharCard
            label="Cedar"
            sublabel="圆框眼镜 · 西装马甲"
            outfit={cedar}
            character="cedar"
            selected={selected === 'cedar'}
            onSelect={() => setSelected('cedar')}
          />
        </div>

        {/* 当前编辑提示 */}
        <div style={{
          textAlign: 'center',
          margin: '0 0 12px',
          fontFamily: '"Pixelify Sans", monospace',
          fontSize: 13,
          letterSpacing: '0.06em',
          color: '#7B5A3F',
        }}>
          ▼ 现在替 {selected === 'vesper' ? 'Vesper' : 'Cedar'} 选 ▼
        </div>

        {/* 角色专属切换按钮 */}
        {selected === 'vesper' && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
            <ToggleBtn active={vesper.catEars} onClick={() => toggleCat('catEars')}>
              🐾 猫耳 {vesper.catEars ? '✓' : ''}
            </ToggleBtn>
            <ToggleBtn active={vesper.catTail} onClick={() => toggleCat('catTail')}>
              🐾 猫尾 {vesper.catTail ? '✓' : ''}
            </ToggleBtn>
          </div>
        )}
        {selected === 'cedar' && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
            <ToggleBtn active={!!cedar.glasses} onClick={cycleGlasses}>
              👓 {cedar.glasses === 'round' ? '圆框' : cedar.glasses === 'square' ? '方框' : '无眼镜'}
            </ToggleBtn>
          </div>
        )}

        {/* Tab */}
        <div style={{ display: 'flex', borderBottom: '2px solid #A89479' }}>
          {[
            { id: 'clothing', label: '衣物' },
            { id: 'preset', label: '预设' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '12px 8px',
                fontFamily: '"Pixelify Sans", monospace',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: tab === t.id ? '#3E2A1B' : '#A89479',
                background: tab === t.id
                  ? 'linear-gradient(180deg, #F4ECE0 0%, #EDE2D0 100%)'
                  : 'transparent',
                border: 'none',
                borderTop: tab === t.id ? '2px solid #A89479' : 'none',
                borderLeft: tab === t.id ? '2px solid #A89479' : 'none',
                borderRight: tab === t.id ? '2px solid #A89479' : 'none',
                marginBottom: tab === t.id ? -2 : 0,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={{
          background: 'linear-gradient(180deg, #F4ECE0 0%, #EDE2D0 100%)',
          border: '2px solid #A89479',
          borderTop: 'none',
          padding: '20px 16px',
          minHeight: 280,
        }}>
          {tab === 'clothing' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 12,
            }}>
              {visibleItems.map(([id, item]) => {
                const isEquipped = outfit[item.layer] === id;
                return (
                  <ItemCard
                    key={id}
                    item={item}
                    equipped={isEquipped}
                    onClick={() => equip(id)}
                  />
                );
              })}
            </div>
          )}

          {tab === 'preset' && (
            <div>
              <button onClick={savePreset} style={presetBtnStyle}>
                💾 保存当前为新预设
              </button>
              <div style={{ marginTop: 16 }}>
                {Object.keys(presets).filter(k => k.startsWith(selected)).length === 0 ? (
                  <p style={{ fontStyle: 'italic', color: '#A89479', textAlign: 'center', padding: '20px 0' }}>
                    {selected === 'vesper' ? 'Vesper' : 'Cedar'} 还没有预设
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {Object.entries(presets)
                      .filter(([k]) => k.startsWith(selected))
                      .map(([k, p]) => (
                        <button
                          key={k}
                          onClick={() => loadPreset(k)}
                          style={presetItemStyle}
                        >
                          {k.split(':')[1]}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{
          marginTop: 32,
          padding: '20px 16px',
          background: 'rgba(255,255,255,0.4)',
          border: '1px dashed #A89479',
          fontSize: 13,
          color: '#5C4030',
        }}>
          <p style={{ margin: 0, fontFamily: 'VT323, monospace', fontSize: 14 }}>
            <span style={{ color: '#7B5A3F', marginRight: 8 }}>[MCP READY]</span>
            后端已暴露 list_items / equip / get_state / save_preset 工具,可被 Claude/Mira 调用。
          </p>
        </footer>
      </div>
    </div>
  );
}

// =============================================================
// 子组件
// =============================================================
function CharCard({ label, sublabel, outfit, character, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? 'linear-gradient(180deg, #FFFAF0 0%, #F4ECE0 100%)' : 'rgba(255,250,240,0.4)',
        border: selected ? '2px solid #6B3F1D' : '2px solid #C9B89A',
        padding: '20px 12px 16px',
        cursor: 'pointer',
        boxShadow: selected ? '4px 4px 0 #A89479' : '2px 2px 0 rgba(168,148,121,0.4)',
        textAlign: 'center',
        transition: 'all 0.18s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <PixelChar character={character} outfit={outfit} scale={1} animate={true} />
      </div>
      <div style={{
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: '#3E2A1B',
      }}>{label}</div>
      <div style={{ fontStyle: 'italic', fontSize: 12, color: '#7B5A3F', marginTop: 2 }}>
        {sublabel}
      </div>
    </button>
  );
}

function ItemCard({ item, equipped, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: 10,
        background: equipped
          ? 'linear-gradient(180deg, #FFFAF0 0%, #F4ECE0 100%)'
          : 'rgba(255,255,255,0.5)',
        border: equipped ? '2px solid #6B3F1D' : '1.5px solid #C9B89A',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: equipped ? '3px 3px 0 #A89479' : 'none',
        transition: 'all 0.12s',
      }}
    >
      <div style={{ flexShrink: 0, padding: 2, background: '#F4ECE0', border: '1px solid #C9B89A' }}>
        <ItemSwatch item={item} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: '"Pixelify Sans", monospace',
          fontSize: 13,
          fontWeight: 600,
          color: '#3E2A1B',
          marginBottom: 4,
        }}>
          {item.name}
          {equipped && <span style={{ marginLeft: 6, fontSize: 10, color: '#5A6B47' }}>· 在身上</span>}
        </div>
        <div style={{
          fontFamily: 'VT323, monospace',
          fontSize: 11,
          color: '#7B5A3F',
          marginBottom: 2,
        }}>
          [{SLOT_LABELS[item.layer] || item.layer}]
        </div>
        <div style={{ fontStyle: 'italic', fontSize: 11, color: '#7B5A3F', lineHeight: 1.4 }}>
          {item.note}
        </div>
      </div>
    </button>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: active ? '#3E2A1B' : '#A89479',
        background: active ? 'linear-gradient(180deg, #FFFAF0 0%, #F4ECE0 100%)' : 'rgba(255,255,255,0.4)',
        border: active ? '2px solid #6B3F1D' : '1.5px solid #C9B89A',
        cursor: 'pointer',
        boxShadow: active ? '2px 2px 0 #A89479' : 'none',
      }}
    >
      {children}
    </button>
  );
}

const presetBtnStyle = {
  padding: '10px 20px',
  fontFamily: '"Pixelify Sans", monospace',
  fontSize: 14,
  background: 'linear-gradient(180deg, #FFFAF0 0%, #F4ECE0 100%)',
  border: '2px solid #6B3F1D',
  color: '#3E2A1B',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 #A89479',
};

const presetItemStyle = {
  padding: '10px 12px',
  fontFamily: '"Pixelify Sans", monospace',
  fontSize: 13,
  background: 'rgba(255,255,255,0.5)',
  border: '1.5px solid #C9B89A',
  color: '#3E2A1B',
  cursor: 'pointer',
  textAlign: 'left',
};
