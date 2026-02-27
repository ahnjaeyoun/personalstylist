/**
 * Supabase가 반환하는 영어 에러 메시지를 번역 키에 매핑합니다.
 */
export function translateAuthError(
  message: string,
  t: Record<string, string>,
): string {
  const msg = message.toLowerCase()

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return t.errorInvalidCredentials
  }
  if (msg.includes('password should contain')) {
    return t.errorPasswordWeak
  }
  if (
    msg.includes('user already registered') ||
    msg.includes('already been registered') ||
    msg.includes('email address already in use') ||
    msg.includes('already registered')
  ) {
    return t.errorEmailInUse
  }
  if (msg.includes('token has expired') || msg.includes('token is invalid') || msg.includes('otp expired')) {
    return t.errorTokenExpired
  }

  return t.errorAuthGeneric
}
