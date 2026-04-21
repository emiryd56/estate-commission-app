import { UserRole } from '~/types'
import { decodeJwtPayload, isValidSession } from '~/utils/jwt'

const PUBLIC_ROUTES = new Set<string>(['/login'])
const ADMIN_ONLY_ROUTES = new Set<string>(['/users'])

export default defineNuxtRouteMiddleware((to) => {
  const tokenCookie = useCookie<string | null>('token')
  const token = tokenCookie.value
  const isPublic = PUBLIC_ROUTES.has(to.path)

  if (!token) {
    return isPublic ? undefined : navigateTo('/login')
  }

  const payload = decodeJwtPayload(token)
  if (!isValidSession(payload)) {
    tokenCookie.value = null
    return isPublic ? undefined : navigateTo('/login')
  }

  if (isPublic) {
    return navigateTo('/')
  }

  if (ADMIN_ONLY_ROUTES.has(to.path) && payload?.role !== UserRole.ADMIN) {
    return navigateTo('/')
  }
})
