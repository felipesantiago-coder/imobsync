"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, Smartphone, Keyboard, Loader2, Fingerprint, AlertCircle } from "lucide-react";

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/projetos";
  const redirectUrl = (rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")) ? rawRedirect : "/projetos";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const [method, setMethod] = useState<"webauthn" | "totp" | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Detectar quais métodos o usuário tem
  useEffect(() => {
    async function checkMethods() {
      try {
        const res = await fetch("/api/mfa/check");
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data = await res.json();
        setHasPasskey(data.hasPasskey);
        setHasTotp(data.hasTotp);

        if (data.hasPasskey) {
          setMethod("webauthn");
          // Tentar WebAuthn automaticamente
          tryWebAuthn();
        } else if (data.hasTotp) {
          setMethod("totp");
        } else {
          // Sem MFA configurada — redirecionar
          router.push(redirectUrl);
        }
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    checkMethods();
     
  }, []);

  const tryWebAuthn = useCallback(async () => {
    setVerifying(true);
    setError("");
    try {
      // Buscar opções de autenticação
      const beginRes = await fetch("/api/mfa/webauthn/authenticate/begin", { method: "POST" });
      if (!beginRes.ok) {
        // WebAuthn falhou, tentar TOTP
        setMethod("totp");
        setVerifying(false);
        return;
      }
      const { options } = await beginRes.json();

      // Autenticar via navegador (biometria)
      const credential = await startAuthentication({ ...options, mediation: "optional" } as any);

      // Verificar no servidor
      const finishRes = await fetch("/api/mfa/webauthn/authenticate/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential, redirectUrl }),
      });

      if (finishRes.ok) {
        const { redirect } = await finishRes.json();
        router.push(redirect);
      } else {
        const errData = await finishRes.json();
        setError(errData.error || "Falha na autenticação");
        // Fallback para TOTP
        if (hasTotp) setMethod("totp");
      }
    } catch (err: any) {
      // WebAuthn não disponível ou cancelado pelo usuário
      console.log("WebAuthn não disponível, usando TOTP:", err?.name);
      if (hasTotp) setMethod("totp");
      else setError("Biometria não disponível neste dispositivo. Use o código TOTP.");
    } finally {
      setVerifying(false);
    }
  }, [redirectUrl, router, hasTotp]);

  const verifyTotp = async () => {
    if (totpCode.length !== 6) return;
    setVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/mfa/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: totpCode, redirectUrl }),
      });

      if (res.ok) {
        const { redirect } = await res.json();
        router.push(redirect);
      } else {
        const data = await res.json();
        setError(data.error || "Código inválido");
        setTotpCode("");
      }
    } catch {
      setError("Erro ao verificar código");
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center h-16 gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Verificação de Segurança</h1>
              <p className="text-[11px] text-gray-400 font-medium">Autenticação em duas etapas</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r bg-[#0D1B2A] p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                {method === "webauthn" ? (
                  <Fingerprint className="w-8 h-8 text-white/80" />
                ) : (
                  <Smartphone className="w-8 h-8 text-white/80" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white">
                {method === "webauthn" ? "Verificação Biométrica" : "Código de Verificação"}
              </h2>
              <p className="text-white/60 text-sm mt-1">
                {method === "webauthn"
                  ? "Use sua biometria para continuar"
                  : "Digite o código de 6 dígitos do seu app autenticador"}
              </p>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {method === "webauthn" && verifying && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  <p className="text-sm text-gray-500">Aguardando biometria...</p>
                </div>
              )}

              {method === "totp" && (
                <>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} onComplete={verifyTotp}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <button
                    onClick={verifyTotp}
                    disabled={totpCode.length !== 6 || verifying}
                    className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifying ? "Verificando..." : "Verificar"}
                  </button>

                  {hasPasskey && (
                    <button
                      onClick={tryWebAuthn}
                      disabled={verifying}
                      className="w-full h-10 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Fingerprint className="w-4 h-4" />
                      Usar biometria ao invés
                    </button>
                  )}
                </>
              )}

              {/* Botão TOTP quando está em WebAuthn e falhou */}
              {method === "webauthn" && !verifying && hasTotp && (
                <button
                  onClick={() => setMethod("totp")}
                  className="w-full h-10 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <Keyboard className="w-4 h-4" />
                  Usar código do autenticador
                </button>
              )}

              <div className="pt-2">
                <button
                  onClick={handleLogout}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Usar outra conta
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MfaVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      }
    >
      <MfaVerifyContent />
    </Suspense>
  );
}