"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  ArrowRight,
  Monitor,
  Smartphone,
} from "lucide-react";

const slides = [
  {
    type: "desktop" as const,
    image: "/mock-desktop-01.webp",
    title: "Espelho de vendas atualizado em tempo real",
    desc: "Disponibilidade, status e preços de todas as unidades ao seu alcance, direto do computador.",
  },
  {
    type: "mobile" as const,
    image: "/mock-mobile-01.webp",
    title: "Acesse de qualquer lugar",
    desc: "Mesmas informações completas no celular. Consulte espelhos e preços onde estiver.",
  },
  {
    type: "desktop" as const,
    image: "/mock-desktop-02.webp",
    title: "Simule e gere propostas em PDF",
    desc: "Crie simulações de pagamento personalizadas e exporte a proposta pronta para envio ao cliente.",
  },
  {
    type: "mobile" as const,
    image: "/mock-mobile-02.webp",
    title: "Gerencie vendas em tempo real",
    desc: "Atualize status de unidades, acompanhe reservas e feche vendas direto pelo celular.",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const reason = searchParams.get("reason");
    if (reason === "unauthorized") return "Este e-mail não tem permissão de administrador.";
    if (reason === "unauthenticated") return "Faça login para acessar.";
    if (reason === "login_error") return "Erro inesperado. Tente novamente.";
    return "";
  });

  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error } = await createClient().auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos"
          : error.message
        );
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError("Sessão não encontrada. Tente novamente.");
        setLoading(false);
        return;
      }

      const isAdminEmail = data.user.email?.toLowerCase() === "prosperosdirecional@gmail.com";

      try {
        const supabase = createClient();

        let profile: Record<string, unknown> | null = null;

        const { data: pFull, error: errFull } = await supabase
          .from("profiles")
          .select("role, mfa_enabled, must_change_password, must_setup_mfa")
          .eq("id", data.user.id)
          .maybeSingle();

        if (!errFull && pFull) {
          profile = pFull as Record<string, unknown> | null;
        } else {
          const { data: pBase, error: errBase } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .maybeSingle();
          if (!errBase) profile = pBase as Record<string, unknown> | null;
        }

          if (profile?.must_change_password) {
            document.cookie = "first_login_step=change_password; path=/; max-age=3600; SameSite=Lax";
            router.push("/change-password");
            router.refresh();
            return;
          }

          if (profile?.must_setup_mfa) {
            document.cookie = "first_login_step=setup_mfa; path=/; max-age=3600; SameSite=Lax";
            router.push("/mfa-onboarding");
            router.refresh();
            return;
          }

          let hasMfa = profile?.mfa_enabled ?? false;
          if (!hasMfa) {
            const [totpRes, passkeyRes] = await Promise.all([
              supabase
                .from("user_totp")
                .select("id")
                .eq("user_id", data.user.id)
                .eq("verified", true)
                .maybeSingle(),
              supabase
                .from("user_passkeys")
                .select("*", { count: "exact", head: true })
                .eq("user_id", data.user.id),
            ]);
            if (totpRes.data) hasMfa = true;
            if (!hasMfa && passkeyRes.count && passkeyRes.count > 0) hasMfa = true;
          }

          const isAdmin =
            (!profile && isAdminEmail) || profile?.role === "admin_sistema";
          if (isAdmin) {
            document.cookie =
              "subscription_status=active; path=/; max-age=300; SameSite=Lax";
          } else {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);
              const refreshRes = await fetch('/api/subscription-refresh', { signal: controller.signal });
              clearTimeout(timeoutId);
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                if (refreshData.status) {
                  document.cookie = `subscription_status=${refreshData.status}; path=/; max-age=300; SameSite=Lax`;
                }
              } else {
                const { data: subProfile } = await supabase
                  .from("profiles")
                  .select("subscription_status")
                  .eq("id", data.user.id)
                  .maybeSingle();
                const subStatus =
                  (subProfile as Record<string, unknown> | null)?.subscription_status ||
                  "none";
                if (subStatus !== "none") {
                  document.cookie = `subscription_status=${subStatus}; path=/; max-age=300; SameSite=Lax`;
                }
              }
            } catch {
              const { data: subProfile } = await supabase
                .from("profiles")
                .select("subscription_status")
                .eq("id", data.user.id)
                .maybeSingle();
              const subStatus =
                (subProfile as Record<string, unknown> | null)?.subscription_status ||
                "none";
              if (subStatus !== "none") {
                document.cookie = `subscription_status=${subStatus}; path=/; max-age=300; SameSite=Lax`;
              }
            }
          }

          const finalRedirect = isAdmin
            ? "/admin-sistema"
            : "/projetos";

          if (
            !isAdmin &&
            document.cookie.includes("subscription_status=pending")
          ) {
            router.push("/aguardando-pagamento");
            router.refresh();
            return;
          }

          if (hasMfa) {
            await fetch('/api/mfa/require', { method: 'POST' }).catch(() => {});
            router.push(`/mfa-verify?redirect=${encodeURIComponent(finalRedirect)}`);
          } else {
            router.push(finalRedirect);
          }
        } catch (err) {
          console.error('[Login] Erro no pós-login:', err);
          setError("Erro ao processar login. Tente novamente.");
          setLoading(false);
          return;
        }
    } catch (err) {
      console.error('[Login] Erro de conexão:', err);
      setError("Erro ao conectar com o servidor");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* ── Left Panel: Login Form ── */}
      <div className="flex flex-col w-full lg:w-[480px] xl:w-[520px] bg-white relative z-10 shrink-0">
        {/* Centered content — no scroll */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[400px] mx-auto px-6 sm:px-8 lg:px-10">
            {/* Logo */}
            <div className="mb-5">
              <img
                src="/imobsync-logo-claro.png"
                alt="ImobSync"
                className="w-full max-w-[200px] sm:max-w-[240px] h-auto"
              />
            </div>

            <div className="w-full h-px bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 mb-5" />

            <h2 className="text-xl font-bold text-slate-900 mb-1">
              Bem-vindo de volta
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              Acesse espelhos de vendas e simuladores de pagamento.
            </p>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-3">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="username"
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00C7F0]/30 focus:border-[#00C7F0]/50 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full h-12 pl-11 pr-11 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00C7F0]/30 focus:border-[#00C7F0]/50 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-[#0D1B2A] text-white font-semibold text-sm hover:bg-[#0D1B2A]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0D1B2A]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Entrando...
                  </span>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Sign-up link */}
            <div className="text-center mt-4">
              <p className="text-sm text-slate-500">
                Não tem conta?{" "}
                <a
                  href="/planos"
                  className="text-slate-900 font-semibold hover:underline underline-offset-2 transition-all"
                >
                  Criar conta
                </a>
              </p>
            </div>

            {/* Secure badge */}
            <div className="mt-4 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-600">Ambiente seguro</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400">Criptografia de ponta a ponta</span>
            </div>
          </div>
        </div>


      </div>

      {/* ── Right Panel: Hero / Features ── */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between relative overflow-hidden"
        style={{ backgroundColor: '#0D1B2A' }}
      >
        {/* Background image with overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&auto=format&fit=crop')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1B2A]/80 via-[#0D1B2A]/60 to-[#0D1B2A]/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D1B2A]/40 to-transparent" />

        {/* Top: subtle branding */}
        <div className="relative z-10 p-8 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-white/50 tracking-wider uppercase">
            Plataforma ativa
          </span>
        </div>

        {/* Center: Device mockup carousel */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-12 overflow-hidden">
          <div className="relative w-full max-w-xl flex flex-col items-center">
            {slides.map((slide, idx) => {
              const isActive = idx === activeFeature;
              const isPrev = idx === (activeFeature - 1 + slides.length) % slides.length;
              let translateX = "translate-x-[120%]";
              if (isActive) translateX = "translate-x-0";
              else if (isPrev) translateX = "-translate-x-[120%]";
              return (
                <div
                  key={slide.title}
                  className={`w-full flex flex-col items-center transition-all duration-700 ease-in-out ${
                    isActive
                      ? `opacity-100 ${translateX} relative`
                      : `opacity-0 ${translateX} pointer-events-none absolute inset-0 justify-center`
                  }`}
                >
                  {/* Device frame */}
                  {slide.type === "desktop" ? (
                    <div className="w-full max-w-[420px]">
                      {/* Monitor bezel */}
                      <div className="rounded-xl border-2 border-white/20 bg-black/40 backdrop-blur-sm p-1.5 shadow-2xl shadow-black/40">
                        <div className="rounded-lg overflow-hidden bg-slate-800">
                          <img
                            src={slide.image}
                            alt={slide.title}
                            className="w-full h-auto block"
                            loading="lazy"
                          />
                        </div>
                      </div>
                      {/* Stand + base */}
                      <div className="flex flex-col items-center mt-1">
                        <div className="w-20 h-3 bg-gradient-to-b from-white/20 to-white/5" />
                        <div className="w-28 h-1 bg-white/15 rounded-full mt-0.5" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center" style={{ height: "280px" }}>
                      {/* Phone frame */}
                      <div className="w-[140px] rounded-[1.6rem] border-2 border-white/20 bg-black/40 backdrop-blur-sm p-1.5 shadow-2xl shadow-black/40">
                        {/* Notch */}
                        <div className="flex justify-center mb-0.5">
                          <div className="w-14 h-3 bg-black rounded-b-lg" />
                        </div>
                        {/* Screen */}
                        <div className="rounded-[1rem] overflow-hidden bg-slate-800">
                          <img
                            src={slide.image}
                            alt={slide.title}
                            className="w-full h-auto block"
                            loading="lazy"
                          />
                        </div>
                        {/* Home indicator */}
                        <div className="flex justify-center mt-1.5">
                          <div className="w-16 h-0.5 bg-white/20 rounded-full" />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Text */}
                  <div className="text-center mt-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-2">
                      {slide.type === "desktop" ? (
                        <Monitor className="w-3 h-3 text-white/70" />
                      ) : (
                        <Smartphone className="w-3 h-3 text-white/70" />
                      )}
                      <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">
                        {slide.type === "desktop" ? "Desktop" : "Mobile"}
                      </span>
                    </div>
                    <h3 className="text-xl xl:text-2xl font-bold text-white mb-1.5 leading-tight">
                      {slide.title}
                    </h3>
                    <p className="text-white/50 text-xs xl:text-sm leading-relaxed">
                      {slide.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom: indicators + stats */}
        <div className="relative z-10 p-8">
          {/* Feature indicators */}
          <div className="flex items-center gap-2 mb-6">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveFeature(idx)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  idx === activeFeature
                    ? "w-8 bg-white"
                    : "w-1.5 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Feature ${idx + 1}`}
              />
            ))}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-8">
            <div>
              <p className="text-2xl font-bold text-white">100%</p>
              <p className="text-xs text-white/40 mt-0.5">Online</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white">SSL</p>
              <p className="text-xs text-white/40 mt-0.5">Criptografado</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white">MFA</p>
              <p className="text-xs text-white/40 mt-0.5">Autenticação dupla</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-slate-400 animate-pulse" />
            <span className="text-sm font-medium text-slate-400">Carregando...</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
