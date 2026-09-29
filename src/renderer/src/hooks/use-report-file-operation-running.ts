import { useEffect } from 'react'
import { useOperationFeedback } from './use-operation-feedback'

/** Main owns the restart guard, so it needs to know when a file operation is running. */
export function useReportFileOperationRunning(): void {
  const running = useOperationFeedback().activity !== null
  useEffect(() => {
    window.api.fileOperationRunningChanged(running)
  }, [running])
}
