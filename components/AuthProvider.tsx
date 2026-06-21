'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthCtx = { user: User | null; loading: boolean }
const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // INITIAL_SESSION fires immediately on subscribe with the persisted session
    // (from localStorage after a refresh). Using it as the single source of truth
    // avoids the race between getSession() and onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)

      // Only mark loading done once we know the initial session state
      if (event === 'INITIAL_SESSION') {
        setLoading(false)
      }

      // Clean hash fragment left by OAuth redirect
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
