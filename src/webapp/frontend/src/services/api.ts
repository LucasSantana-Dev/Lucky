import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/api/auth/discord'
    }
    const errorMessage = error.response?.data?.error || error.message || 'An error occurred'
    console.error('API Error:', errorMessage, error)
    return Promise.reject(error)
  },
)

export default api
