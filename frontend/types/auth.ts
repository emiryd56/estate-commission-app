import type { UserRole } from './user'

export interface AuthUser {
  _id: string
  name: string
  email: string
  role: UserRole
}

export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export interface AuthenticatedUser {
  userId: string
  email: string
  role: UserRole
}
