export const PERMISSION_DENIED_PREFIX = 'PERMISSION_DENIED: '

export function isPermissionDeniedMessage(message: string): boolean {
  return message.includes(PERMISSION_DENIED_PREFIX)
}
