export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Mode = 'auto' | 'off' | Level
export type Pick = { level: Level; reason: string; source: 'model' | 'rules' | 'asked' | 'pinned' | 'kept' }

declare module 'claude-code' {
  interface PluginState {
    'effort-picker': { mode: Mode; pick: Pick | null }
  }
}
