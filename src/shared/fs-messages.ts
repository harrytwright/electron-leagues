export const PERMISSION_DENIED_MESSAGE = 'That folder can’t be read or changed (permission denied)'

export function isPermissionDeniedMessage(message: string): boolean {
  return message.includes(PERMISSION_DENIED_MESSAGE)
}
