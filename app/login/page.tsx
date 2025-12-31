'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient() 
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError("E-mail ou senha incorretos. Tente novamente.")
      setLoading(false)
      return
    }

    router.refresh() 
    router.push('/') // Redireciona para o Dashboard (raiz)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f3f4f6] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Cabeçalho do Card */}
        <div className="bg-[#1e6a8d] p-8 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Chamados a Servir
          </h1>
          <p className="text-blue-100 text-sm mt-2 font-medium">
            Gestão de Indicadores e Metas
          </p>
        </div>

        {/* Formulário */}
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* Campo de Email */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                E-mail institucional
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1e6a8d] transition-colors" size={20} />
                <input
                  type="email"
                  required
                  placeholder="exemplo@igreja.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-black outline-none focus:border-[#1e6a8d] focus:ring-2 focus:ring-[#1e6a8d]/10 transition-all"
                />
              </div>
            </div>

            {/* Campo de Senha */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                Senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1e6a8d] transition-colors" size={20} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-black outline-none focus:border-[#1e6a8d] focus:ring-2 focus:ring-[#1e6a8d]/10 transition-all"
                />
              </div>
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 p-3 rounded-lg text-red-600 text-sm animate-shake">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Botão Entrar */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#1e6a8d] hover:bg-[#16516d] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  <span>Acessar Sistema</span>
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center border-t border-gray-100 pt-6">
            <p className="text-gray-400 text-xs">
              Uso exclusivo para líderes autorizados.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}