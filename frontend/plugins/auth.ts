import { decodeJwtPayload, isValidSession } from '~/utils/jwt'

export default defineNuxtPlugin(() => {
  const tokenCookie = useCookie<string | null>('token')
  if (!tokenCookie.value) {
    return
  }

  const payload = decodeJwtPayload(tokenCookie.value)
  if (!isValidSession(payload)) {
    tokenCookie.value = null
    return
  }

  const authStore = useAuthStore()
  if (!authStore.user && payload?.sub && payload.email && payload.role) {
    authStore.user = {
      _id: payload.sub,
      name: payload.email,
      email: payload.email,
      role: payload.role,
    }
  }
})
