export type Handoff = { at: number; percent: number; file: string | null; ok: boolean; note: string }

declare module 'claude-code' {
  interface PluginState {
    'meter-and-handoff': {
      percent: number | null
      threshold: number
      enabled: boolean
      pending: boolean
      last: Handoff | null
    }
  }
}
