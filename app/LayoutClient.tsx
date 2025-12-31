'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client' // Verifique se o caminho do seu client está correto
import Sidebar from './components/Sidebar'

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const isLoginPage = pathname === '/login'

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      // Se não estiver logado e não estiver na página de login, manda para o login
      if (!session && !isLoginPage) {
        router.push('/login')
      } 
      // Se estiver logado e tentar acessar o login, manda para a home
      else if (session && isLoginPage) {
        router.push('/')
      }

      setIsLoading(false)
    }

    checkUser()

    // Escuta mudanças na autenticação (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isLoginPage) {
        router.push('/login')
      }
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isLoginPage, router])

  // Enquanto verifica se está logado, mostra uma tela vazia ou carregando
  if (isLoading && !isLoginPage) {
    return <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">Carregando...</div>
  }

  return (
    <div className="flex min-h-screen">
      {!isLoginPage && <Sidebar />}

      <main
        className={`flex-1 h-screen overflow-y-auto ${
          isLoginPage ? 'bg-[#f3f4f6]' : 'bg-gray-50/50'
        }`}
      >
        <div className={`${isLoginPage ? '' : 'p-8 max-w-7xl mx-auto'}`}>
          {children}
        </div>
      </main>
    </div>
  )
}