/**
 * Browser half of the plugin: this plugin's own device panel plus the vendored
 * DSH workspace region (extended with a devices group above the tree).
 */
import { apply as applyPanel, inject as panelInject } from './panel.js'
import { apply as applyWorkspace, inject as workspaceInject } from '../../vendor/workspace-browser/src/client/index.ts'

export const inject = [...new Set([...panelInject, ...workspaceInject])]

export function apply(ctx: Parameters<typeof applyPanel>[0]): void {
  applyPanel(ctx)
  applyWorkspace(ctx)
}
