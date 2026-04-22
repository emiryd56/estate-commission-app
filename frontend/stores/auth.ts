import { defineStore } from 'pinia'
import type { AuthUser, LoginPayload, LoginResponse } from '~/types'
import { UserRole } from '~/types'

interface AuthStoreState {
  user: AuthUser | null
  loading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthStoreState => ({
    user: null,
    loading: false,
    error: null,
  }),

  getters: {
    isAuthenticated: (state): boolean => state.user !== null,
    isAdmin: (state): boolean => state.user?.role === UserRole.ADMIN,
  },

  actions: {
    async login(payload: LoginPayload): Promise<AuthUser> {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: payload,
        })

        const tokenCookie = useCookie<string | null>('token', {
          maxAge: 60 * 60 * 24,
          sameSite: 'lax',
          secure: !import.meta.dev,
        })
        tokenCookie.value = response.accessToken
        this.user = response.user
        return response.user
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async hydrate(): Promise<void> {
      const tokenCookie = useCookie<string | null>('token')
      if (!tokenCookie.value) {
        this.user = null
        return
      }
      try {
        const api = useApi()
        const me = await api<{
          userId: string
          name: string
          email: string
          role: UserRole
        }>('/auth/me')
        this.user = {
          _id: me.userId,
          name: me.name,
          email: me.email,
          role: me.role,
        }
      } catch {
        tokenCookie.value = null
        this.user = null
      }
    },

    logout(): void {
      const tokenCookie = useCookie<string | null>('token')
      tokenCookie.value = null
      this.user = null
    },
  },
})
