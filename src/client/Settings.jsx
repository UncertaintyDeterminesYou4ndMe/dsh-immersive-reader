import React, { useEffect, useState } from 'react'
import { api } from './api.js'

const EFFORTS = [['', '跟随模型默认'], ['low', '低（快）'], ['medium', '中'], ['high', '高（慢）']]

export function Settings({ settings, onChange, onBack }) {
  const [draft, setDraft] = useState(settings)
  const [models, setModels] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { api.models().then(setModels).catch(() => setModels({ available: false, groups: [] })) }, [])
  useEffect(() => { setDraft(settings) }, [settings])

  const set = (patch) => setDraft(d => ({ ...d, ...patch }))
  const save = async () => {
    setSaving(true); setError('')
    try { onChange(await api.saveSettings(draft)); onBack() } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const modelValue = draft.provider && draft.model ? `${draft.provider}\u0000${draft.model}` : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ir-bar" data-window-drag="">
        <button className="ir-plain" onClick={onBack}>‹ 返回</button>
        <div className="ir-title">设置</div>
        <div className="ir-right"><button className="ir-primary" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</button></div>
      </div>
      {error ? <div className="ir-error">{error}</div> : null}
      <div className="ir-scroll">
        <div className="ir-settings">
          <div className="ir-field">
            <label>预译范围</label>
            <div className="ir-row">
              <span>当前位置之后</span>
              <input type="number" min="0" max="999" style={{ width: '5em' }} value={draft.lookahead?.count ?? 1} onChange={e => set({ lookahead: { ...draft.lookahead, count: Number(e.target.value) } })} />
              <span className="ir-seg">
                <button className={draft.lookahead?.unit === 'chapters' ? 'ir-on' : ''} onClick={() => set({ lookahead: { ...draft.lookahead, unit: 'chapters' } })}>章</button>
                <button className={draft.lookahead?.unit === 'paragraphs' ? 'ir-on' : ''} onClick={() => set({ lookahead: { ...draft.lookahead, unit: 'paragraphs' } })}>段</button>
              </span>
            </div>
            <div className="ir-field-help">按「章」时，总会先译完当前章剩余部分，再往后译 N 章；按「段」时只保证往后 N 段。读到哪里，就从哪里往后补。</div>
          </div>
          <div className="ir-field">
            <label>每份阅读量</label>
            <div className="ir-row">
              <input type="number" min="5" max="180" style={{ width: '5em' }} value={draft.sessionMinutes ?? 30} onChange={e => set({ sessionMinutes: Number(e.target.value) })} />
              <span>分钟</span>
            </div>
            <div className="ir-field-help">每天打开书时按这个时长切出「今日份」，读到份尾可以做回想；读完还想读就「再读一份」。</div>
          </div>
          <div className="ir-field">
            <label>模型</label>
            <select value={modelValue} onChange={e => { const [provider, model] = e.target.value.split('\u0000'); set({ provider: provider ?? '', model: model ?? '' }) }}>
              <option value="">跟随 dsh 当前默认{models?.default ? `（${models.default.model}）` : ''}</option>
              {(models?.groups ?? []).map(g => (
                <optgroup key={g.id} label={g.name}>
                  {g.models.map(m => <option key={m.id} value={`${g.id}\u0000${m.id}`}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="ir-field-help">{models === null ? '读取模型列表…' : models.available ? '列表来自 dsh 的模型设置。' : '宿主没提供模型列表，只能跟随默认模型。'}</div>
          </div>
          <div className="ir-field">
            <label>思考强度</label>
            <select value={draft.reasoningEffort ?? ''} onChange={e => set({ reasoningEffort: e.target.value })}>
              {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="ir-field-help">翻译不需要很深的推理；模型不支持所选档位时会报错，改回默认即可。</div>
          </div>
          <div className="ir-field">
            <label>并发</label>
            <input type="number" min="1" max="4" style={{ width: '5em' }} value={draft.concurrency ?? 2} onChange={e => set({ concurrency: Number(e.target.value) })} />
            <div className="ir-field-help">同时进行的模型调用数，1–4。</div>
          </div>
          <div className="ir-field">
            <label>译文风格</label>
            <textarea value={draft.style ?? ''} onChange={e => set({ style: e.target.value })} />
          </div>
          <div className="ir-field">
            <label>附加要求</label>
            <textarea placeholder="例如：人名保留英文；经济学术语按曼昆教材译法；多用短句。" value={draft.instruction ?? ''} onChange={e => set({ instruction: e.target.value })} />
          </div>
          <div className="ir-field">
            <label>译注与导读</label>
            <div className="ir-row">
              <label><input type="checkbox" checked={Boolean(draft.notes)} onChange={e => set({ notes: e.target.checked })} /> 需要时写译注</label>
              <label><input type="checkbox" checked={Boolean(draft.intros)} onChange={e => set({ intros: e.target.checked })} /> 生成全书导读与各章导读</label>
            </div>
          </div>
          <div className="ir-field">
            <label>默认显示</label>
            <span className="ir-seg">
              {[['zh', '译文'], ['bilingual', '双语'], ['original', '原文']].map(([v, l]) => (
                <button key={v} className={draft.display === v ? 'ir-on' : ''} onClick={() => set({ display: v })}>{l}</button>
              ))}
            </span>
            <div className="ir-field-help">「译文」模式下点一下段落即可看原文。</div>
          </div>
          <div className="ir-field">
            <label>正文字体</label>
            <span className="ir-seg">
              {[['serif', '宋体'], ['sans', '黑体']].map(([v, l]) => (
                <button key={v} className={(draft.fontFamily ?? 'serif') === v ? 'ir-on' : ''} onClick={() => set({ fontFamily: v })}>{l}</button>
              ))}
            </span>
            <div className="ir-field-help">宋体接近纸书；低分辨率屏幕上黑体更清楚。</div>
          </div>
          <div className="ir-field">
            <label>朗读语速</label>
            <input type="number" min="0.5" max="2" step="0.1" style={{ width: '5em' }} value={draft.speechRate ?? 1} onChange={e => set({ speechRate: Number(e.target.value) })} />
            <div className="ir-field-help">用系统语音读译文（原文模式读原文），1 为正常语速。</div>
          </div>
          <div className="ir-field">
            <label>字号 / 行高</label>
            <div className="ir-row">
              <input type="number" min="12" max="32" style={{ width: '5em' }} value={draft.fontSize ?? 18} onChange={e => set({ fontSize: Number(e.target.value) })} />
              <input type="number" min="1.2" max="2.6" step="0.1" style={{ width: '5em' }} value={draft.lineHeight ?? 1.9} onChange={e => set({ lineHeight: Number(e.target.value) })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
