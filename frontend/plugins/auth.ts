import { UserRole } from '~/types'

interface MinimalJwtPayload {
  sub?: string
  email?: string
  role?: UserRole
}

function decodeJwtPayload(token: string): MinimalJwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json) as MinimalJwtPayload
  } catch {
    return null
  }
}

export default defineNuxtPlugin(() => {
  const tokenCookie = useCookie<string | null>('token')
  if (!tokenCookie.value) {
    return
  }

  const payload = decodeJwtPayload(tokenCookie.value)
  if (!payload?.sub || !payload.email || !payload.role) {
    tokenCookie.value = null
    return
  }

  const authStore = useAuthStore()
  if (!authStore.user) {
    authStore.user = {
      _id: payload.sub,
      name: payload.email,
      email: payload.email,
      role: payload.role,
    }
  }
})
