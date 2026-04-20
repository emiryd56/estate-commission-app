import { UserRole } from '~/types'

const PUBLIC_ROUTES = new Set<string>(['/login'])
const ADMIN_ONLY_ROUTES = new Set<string>(['/users'])

interface MinimalPayload {
  sub?: string
  email?: string
  role?: UserRole
}

function decodeJwtPayload(token: string): MinimalPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json) as MinimalPayload
  } catch {
    return null
  }
}

export default defineNuxtRouteMiddleware((to) => {
  const tokenCookie = useCookie<string | null>('token')
  const token = tokenCookie.value
  const isPublic = PUBLIC_ROUTES.has(to.path)

  if (!token) {
    if (!isPublic) {
      return navigateTo('/login')
    }
    return
  }

  const payload = decodeJwtPayload(token)
  if (!payload?.role) {
    tokenCookie.value = null
    if (!isPublic) {
      return navigateTo('/login')
    }
    return
  }

  if (isPublic) {
    return navigateTo('/')
  }

  if (ADMIN_ONLY_ROUTES.has(to.path) && payload.role !== UserRole.ADMIN) {
    return navigateTo('/')
  }
})
