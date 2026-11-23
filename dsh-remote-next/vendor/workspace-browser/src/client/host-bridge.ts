/**
 * Small in-bundle bridge between the forked workspace region and this plugin's
 * own panel: both live in one client module, so a module-level object is the
 * cheapest way to share navigation without another Host round trip.
 */
export interface HostBridge {
  /** Select this plugin's global panel, optionally focusing a device. */
  selectPanel: (deviceId?: string) => void
  /** Open a DSH Session from a forked row. */
  openSession?: (sessionId: string) => void
}

export const hostBridge: HostBridge = {
  selectPanel: (deviceId) => {
    const select = (globalThis as { __AA_REMOTE_SELECT_PANEL__?: (deviceId?: string) => void }).__AA_REMOTE_SELECT_PANEL__
    select?.(deviceId)
  },
}
