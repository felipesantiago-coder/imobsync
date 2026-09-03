"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Shield,
  ShieldCheck,
  Smartphone,
  Fingerprint,
  QrCode,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Key,
  PartyPopper,
  CheckCircle2,
} from "lucide-react";

type Step = "intro" | "totp-qr" | "totp-verify" | "totp-done" | "biometry-offer" | "complete";

export default function MfaOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("intro");

  // TOTP
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState("");

  // Biometry
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnError, setWebauthnError] = useState("");

  // Progresso
  const getProgress = () => {
    switch (step) {
      case "intro": return 0;
      case "totp-qr": return 15;
      case "totp-verify": return 40;
      case "totp-done": return 60;
      case "biometry-offer": return 75;
      case "complete": return 100;
      default: return 0;
    }
  };

  const getStepLabel = () => {
    switch (step) {
      case "intro": return "Boas-vindas";
      case "totp-qr": return "Configurar autenticador";
      case "totp-verify": return "Verificar código";
      case "totp-done": return "Autenticador configurado";
      case "biometry-offer": return "Segurança extra";
      case "complete": return "Tudo pronto!";
    }
  };

  // ─── TOTP Setup ────────────────────────────────────────
  const startTotpSetup = useCallback(async () => {
    setTotpLoading(true);
    setTotpError("");
    try {
      const res = await fetch("/api/mfa/totp/setup", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erro ao gerar TOTP");
      }
      const { secret, qrDataUrl: qr } = await res.json();
      setTotpSecret(secret);
      setQrDataUrl(qr);
      setStep("totp-qr");
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setTotpLoading(false);
    }
  }, []);

  const verifyTotp = async () => {
    if (totpCode.length !== 6) return;
    setTotpLoading(true);
    setTotpError("");
    try {
      const res = await fetch("/api/mfa/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: totpCode, isSetup: true }),
      });
      if (res.ok) {
        setStep("totp-done");
        setTotpCode("");
      } else {
        const d = await res.json();
        setTotpError(d.error || "Código inválido");
        setTotpCode("");
      }
    } catch {
      setTotpError("Erro ao verificar");
    } finally {
      setTotpLoading(false);
    }
  };

  // ─── WebAuthn (optional) ───────────────────────────────
  const registerPasskey = async () => {
    setWebauthnLoading(true);
    setWebauthnError("");
    try {
      const beginRes = await fetch("/api/mfa/webauthn/register/begin", { method: "POST" });
      if (!beginRes.ok) {
        const d = await beginRes.json();
        throw new Error(d.error || "Erro ao iniciar");
      }
      const { options } = await beginRes.json();
      const credential = await startRegistration({ ...options } as any);

      const deviceName =
        navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("Android")
          ? "Celular"
          : "Computador";

      const finishRes = await fetch("/api/mfa/webauthn/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential, deviceName }),
      });

      if (finishRes.ok) {
        setStep("complete");
      } else {
        const d = await finishRes.json();
        throw new Error(d.error || "Falha no registro");
      }
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setWebauthnError("Operação cancelada. Você pode configurar depois.");
      } else {
        setWebauthnError(err?.message || "Erro ao registrar. Tente novamente.");
      }
    } finally {
      setWebauthnLoading(false);
    }
  };

  // ─── Completar onboarding ──────────────────────────────
  const completeOnboarding = async () => {
    try {
      await fetch("/api/first-login/complete-mfa", { method: "POST" });
      router.push("/projetos");
    } catch {
      router.push("/projetos");
    }
  };

  // ─── Logout ─────────────────────────────────────────────
  const handleLogout = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Primeiro Acesso</h1>
                <p className="text-[11px] text-gray-400 font-medium">
                  Etapa 2 de 2 — {getStepLabel()}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 pt-4">
        <div className="max-w-lg mx-auto">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0D1B2A] to-gray-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* ═══ INTRO ═══ */}
            {step === "intro" && (
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Vamos proteger sua conta
                </h2>
                <p className="text-gray-500 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
                  Para garantir a segurança dos dados, você precisa configurar a
                  autenticação em duas etapas. Vamos guiá-lo passo a passo.
                </p>

                <div className="mt-8 space-y-3 text-left">
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Configurar App Autenticador</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Escaneie um QR Code com Google Authenticator ou Authy.
                        Isso será obrigatório para seus logins.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Biometria (opcional)</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Após configurar o app, você poderá adicionar impressão digital
                        ou Face ID como método alternativo mais rápido.
                      </p>
                    </div>
                  </div>
                </div>

                {totpError && (
                  <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {totpError}
                  </div>
                )}

                <button
                  onClick={startTotpSetup}
                  disabled={totpLoading}
                  className="mt-6 w-full h-12 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {totpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparando...
                    </>
                  ) : (
                    <>
                      Começar configuração
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ═══ TOTP QR CODE ═══ */}
            {step === "totp-qr" && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                    <QrCode className="w-7 h-7 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Escaneie o QR Code
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Abra o <span className="font-semibold">Google Authenticator</span> ou{" "}
                    <span className="font-semibold">Authy</span> no seu celular e escaneie:
                  </p>
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="inline-block p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
                    { }
                    <img src={qrDataUrl} alt="QR Code" className="w-52 h-52" />
                  </div>
                </div>

                {/* Chave manual */}
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xs text-gray-500 mb-1">
                    Não consegue escanear? Digite esta chave manualmente:
                  </p>
                  <p className="text-xs font-mono text-gray-700 select-all break-all">
                    {totpSecret}
                  </p>
                </div>

                <button
                  onClick={() => setStep("totp-verify")}
                  className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  Escanei o QR Code, continuar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ═══ TOTP VERIFY ═══ */}
            {step === "totp-verify" && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Digite o código de 6 dígitos
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Abra o app autenticador no seu celular e digite o código que aparece:
                  </p>
                </div>

                {totpError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {totpError}
                  </div>
                )}

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={setTotpCode}
                    onComplete={verifyTotp}
                    autoFocus
                  >
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
                  disabled={totpCode.length !== 6 || totpLoading}
                  className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {totpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      Verificar e ativar
                      <Check className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setStep("totp-qr");
                    setTotpError("");
                  }}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
                >
                  Voltar ao QR Code
                </button>
              </div>
            )}

            {/* ═══ TOTP DONE ═══ */}
            {step === "totp-done" && (
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Autenticação configurada!
                </h2>
                <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
                  Seu app autenticador está ativo. A partir de agora, você precisará
                  digitar o código a cada login.
                </p>
                <button
                  onClick={() => setStep("biometry-offer")}
                  className="mt-6 w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ═══ BIOMETRY OFFER (optional) ═══ */}
            {step === "biometry-offer" && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                    <Fingerprint className="w-7 h-7 text-purple-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Deseja adicionar biometria?
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Use impressão digital ou Face ID para login rápido,
                    sem precisar digitar código.
                  </p>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="flex items-start gap-3">
                    <Fingerprint className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-purple-700">
                      <p className="font-semibold">Opcional</p>
                      <p className="mt-0.5 text-purple-600/80">
                        Você pode configurar a biometria agora ou a qualquer momento
                        pela página de Segurança.
                      </p>
                    </div>
                  </div>
                </div>

                {webauthnError && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {webauthnError}
                  </div>
                )}

                <button
                  onClick={registerPasskey}
                  disabled={webauthnLoading}
                  className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {webauthnLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registrando biometria...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4" />
                      Configurar biometria
                    </>
                  )}
                </button>

                <button
                  onClick={completeOnboarding}
                  disabled={webauthnLoading}
                  className="w-full h-11 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  Pular e finalizar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ═══ COMPLETE ═══ */}
            {step === "complete" && (
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                  <PartyPopper className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Tudo pronto!
                </h2>
                <p className="text-gray-500 text-sm mt-2">
                  Sua conta está protegida. Redirecionando...
                </p>
                <div className="mt-4 flex justify-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Senha definida
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Autenticador ativo
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Biometria ativa
                  </div>
                </div>
                <button
                  onClick={completeOnboarding}
                  className="mt-6 w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg"
                >
                  Acessar o sistema
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
