import { useEffect, useRef } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { useAppUpdateStatus } from '@renderer/hooks/use-app-update-status'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { useReportFileOperationRunning } from '@renderer/hooks/use-report-file-operation-running'

type ToastManager = ReturnType<typeof useKumoToastManager>
type ToastContent = Parameters<ToastManager['add']>[0]

function toastId(version: string): string {
  return `app-update-ready-${version}`
}

const compactAction = { size: 'sm', className: 'text-sm' } as const

function readyToastContent(
  version: string,
  activityLabel: string | null,
  dismiss: () => void
): ToastContent {
  const runningTask = activityLabel?.toLowerCase()
  return {
    title: 'Update ready',
    description: runningTask
      ? `Version ${version} is ready. Restart is unavailable while ${runningTask} is running.`
      : `Version ${version} is ready. Restart GoBowling Leagues to update.`,
    timeout: 0,
    actions: [
      {
        ...compactAction,
        children: 'Restart now',
        variant: 'primary',
        disabled: runningTask !== undefined,
        title: runningTask ? `Wait for ${runningTask} to finish` : undefined,
        onClick: () => void window.api.installAppUpdate()
      },
      { ...compactAction, children: 'Later', variant: 'ghost', onClick: dismiss }
    ]
  }
}

/** Offers the restart once per downloaded version; renders nothing itself. */
export function UpdateReadyToast(): null {
  const status = useAppUpdateStatus()
  const { add, close, update } = useKumoToastManager()
  const { activity } = useOperationFeedback()
  useReportFileOperationRunning()
  const toastedVersions = useRef(new Set<string>())
  const openToastId = useRef<string | null>(null)
  const readyVersion = status?.update.kind === 'ready' ? status.update.version : null
  const activityLabel = activity?.label ?? null

  const latest = useRef({ add, close, update, activityLabel })
  useEffect(() => {
    latest.current = { add, close, update, activityLabel }
  })

  useEffect(() => {
    const { add, close, activityLabel } = latest.current
    if (!readyVersion) {
      if (openToastId.current) close(openToastId.current)
      openToastId.current = null
      return
    }
    if (toastedVersions.current.has(readyVersion)) return
    toastedVersions.current.add(readyVersion)
    const id = toastId(readyVersion)
    openToastId.current = id
    add({ ...readyToastContent(readyVersion, activityLabel, () => close(id)), id })
  }, [readyVersion])

  useEffect(() => {
    if (!openToastId.current || !readyVersion) return
    const { update, close } = latest.current
    const id = toastId(readyVersion)
    update(
      id,
      readyToastContent(readyVersion, activityLabel, () => close(id))
    )
  }, [activityLabel, readyVersion])

  return null
}
