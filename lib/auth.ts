import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const usersEnv = process.env.NEXTAUTH_USERS || ''
        const users = usersEnv.split(',').map((u) => {
          const [email, password] = u.split(':')
          return { email: email.trim(), password: password.trim() }
        })

        const user = users.find(
          (u) => u.email === credentials.email && u.password === credentials.password
        )

        if (user) {
          return { id: user.email, email: user.email, name: user.email.split('@')[0] }
        }
        return null
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string
      }
      return session
    },
  },
}
