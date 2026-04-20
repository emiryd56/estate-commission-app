type ApiClient = ReturnType<typeof $fetch.create>

export function useApi(): ApiClient {
  const config = useRuntimeConfig()
  const tokenCookie = useCookie<string | null>('token')

  return $fetch.create({
    baseURL: config.public.apiBase,
    headers: {
      Accept: 'application/json',
    },
    onRequest({ options }) {
      if (tokenCookie.value) {
        const headers = new Headers(options.headers)
        headers.set('Authorization', `Bearer ${tokenCookie.value}`)
        options.headers = headers
      }
    },
    onResponseError({ response }) {
      const message =
        (response._data as { message?: string | string[] } | undefined)
          ?.message ?? response.statusText
      console.error(`[API ${response.status}]`, message)
    },
  })
}
