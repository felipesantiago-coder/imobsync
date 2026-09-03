"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Fingerprint, Smartphone, Plus, Trash2, Check, Loader2, AlertCircle, ArrowLeft, Key } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";

type Tab = "totp" | "passkey";

export default function MfaSetupPage() {
  const router = useRouter();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [totpConfigured, setTotpConfigured] = useState(false);
  const [passkeys, setPasskeys] = useState<{ id: string; device_name: string; created_at: string }[]>([]);
  const [tab, setTab] = useState<Tab>("totp");

  // TOTP state
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpStep, setTotpStep] = useState<"idle" | "qr" | "verify">("idle");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState("");

  // WebAuthn state
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnError, setWebauthnError] = useState("");
  const [webauthnSuccess, setWebauthnSuccess] = useState(false);

  // Disable MFA dialog
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableTotpCode, setDisableTotpCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState("");

  // Delete passkey confirmation
  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null);
  const [deletePasskeyLoading, setDeletePasskeyLoading] = useState(false);

  // General
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch("/api/mfa/status");
      if (!res.ok) { router.push("/"); return; }
      const data = await res.json();
      setMfaEnabled(data.mfa_enabled);
      setTotpConfigured(data.hasTotp);
      setPasskeys(data.passkeys || []);
    } catch { router.push("/"); }
    finally { setLoading(false); }
  }

  // ─── TOTP ───────────────────────────────────────────
  const startTotpSetup = async () => {
    setTotpLoading(true);
    setTotpError("");
    try {
      const res = await fetch("/api/mfa/totp/setup", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        setTotpError(d.error || "Erro ao gerar TOTP");
        return;
      }
      const { secret, qrDataUrl: qr } = await res.json();
      setTotpSecret(secret);
      setQrDataUrl(qr);
      setTotpStep("verify");
    } catch { setTotpError("Erro ao conectar"); }
    finally { setTotpLoading(false); }
  };

  const verifyTotpSetup = async () => {
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
        setTotpStep("idle");
        setTotpConfigured(true);
        setMfaEnabled(true);
        setTotpCode("");
        setQrDataUrl("");
        setTotpSecret("");
        await loadStatus();
      } else {
        const d = await res.json();
        setTotpError(d.error || "Código inválido");
        setTotpCode("");
      }
    } catch { setTotpError("Erro ao verificar"); }
    finally { setTotpLoading(false); }
  };

  // ─── WebAuthn ───────────────────────────────────────
  const registerPasskey = async () => {
    setWebauthnLoading(true);
    setWebauthnError("");
    setWebauthnSuccess(false);
    try {
      const beginRes = await fetch("/api/mfa/webauthn/register/begin", { method: "POST" });
      if (!beginRes.ok) {
        const d = await beginRes.json();
        setWebauthnError(d.error || "Erro ao iniciar registro");
        return;
      }
      const { options } = await beginRes.json();

      const credential = await startRegistration({ ...options } as any);

      const deviceName = prompt("Dê um nome para este dispositivo:", navigator.userAgent.includes("Mac") ? "MacBook" : navigator.userAgent.includes("Windows") ? "Windows PC" : "Dispositivo") || "Dispositivo";

      const finishRes = await fetch("/api/mfa/webauthn/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential, deviceName }),
      });

      if (finishRes.ok) {
        setWebauthnSuccess(true);
        setMfaEnabled(true);
        await loadStatus();
      } else {
        const d = await finishRes.json();
        setWebauthnError(d.error || "Falha no registro");
      }
    } catch (err: any) {
      console.error('WebAuthn register error:', err);
      if (err?.name === "NotAllowedError") {
        setWebauthnError("Operação cancelada ou biometria não disponível neste navegador.");
      } else if (err?.name === "SecurityError") {
        setWebauthnError("WebAuthn requer conexão segura (HTTPS). Verifique se o site usa HTTPS.");
      } else {
        setWebauthnError(err?.message || "Erro ao registrar passkey. Tente novamente.");
      }
    } finally { setWebauthnLoading(false); }
  };

  // ─── Disable ─────────────────────────────────────────
  const openDisableDialog = () => {
    setDisableTotpCode("");
    setDisableError("");
    setShowDisableDialog(true);
  };

  const cancelDisable = () => {
    setShowDisableDialog(false);
    setDisableTotpCode("");
    setDisableError("");
    setDisableLoading(false);
  };

  const confirmDisableMfa = async () => {
    // Se TOTP está configurado, exige código de 6 dígitos
    if (totpConfigured && disableTotpCode.length !== 6) {
      setDisableError("Digite o código de 6 dígitos do seu app autenticador.");
      return;
    }

    setDisableLoading(true);
    setDisableError("");

    try {
      const body: Record<string, string> = {};
      if (totpConfigured) {
        body.totpCode = disableTotpCode;
      }

      const res = await fetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMfaEnabled(false);
        setTotpConfigured(false);
        setPasskeys([]);
        setShowDisableDialog(false);
        setDisableTotpCode("");
      } else {
        const d = await res.json().catch(() => ({ error: "Erro ao desativar MFA." }));
        setDisableError(d.error || "Erro ao desativar MFA. Tente novamente.");
      }
    } catch {
      setDisableError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setDisableLoading(false);
    }
  };

  const deletePasskey = async (id: string) => {
    setDeletePasskeyId(id);
  };

  const confirmDeletePasskey = async () => {
    if (!deletePasskeyId) return;
    setDeletePasskeyLoading(true);
    try {
      const res = await fetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkeyId: deletePasskeyId }),
      });
      if (res.ok) {
        await loadStatus();
      } else {
        const d = await res.json().catch(() => ({ error: "" }));
        alert(d.error || "Erro ao remover dispositivo. Tente novamente.");
      }
    } catch {
      alert("Erro de conexão. Verifique sua internet.");
    } finally {
      setDeletePasskeyLoading(false);
      setDeletePasskeyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
            <button onClick={() => router.back()} className="hover:bg-white/10 rounded-lg p-2 -ml-2 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Segurança da Conta</h1>
              <p className="text-[11px] text-gray-400 font-medium">Autenticação em duas etapas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Status card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mfaEnabled ? "bg-emerald-100" : "bg-gray-100"}`}>
                  <Shield className={`w-5 h-5 ${mfaEnabled ? "text-emerald-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Autenticação de dois fatores</h3>
                  <p className="text-sm text-gray-500">
                    {mfaEnabled ? "Ativada — sua conta está protegida" : "Desativada — recomendamos ativar"}
                  </p>
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${mfaEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {mfaEnabled ? "Ativa" : "Inativa"}
              </div>
            </div>
            {mfaEnabled && (
              <button onClick={openDisableDialog} className="mt-4 text-sm text-red-500 hover:text-red-700 transition-colors">
                Desativar autenticação de dois fatores
              </button>
            )}

            {/* Disable MFA Dialog */}
            {showDisableDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Desativar 2FA</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Isso removerá toda proteção de autenticação em duas etapas da sua conta.
                      </p>
                    </div>
                  </div>

                  {totpConfigured && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-700 font-medium">
                        Digite o código do seu app autenticador para confirmar:
                      </p>
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={disableTotpCode}
                          onChange={(v) => { setDisableTotpCode(v); setDisableError(""); }}
                          onComplete={confirmDisableMfa}
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
                    </div>
                  )}

                  {disableError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {disableError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={cancelDisable}
                      disabled={disableLoading}
                      className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmDisableMfa}
                      disabled={disableLoading || (totpConfigured && disableTotpCode.length !== 6)}
                      className="flex-1 h-10 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {disableLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Desativando...</>
                      ) : (
                        "Desativar 2FA"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => setTab("totp")}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "totp" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              >
                <Smartphone className="w-4 h-4" />
                App Autenticador
              </button>
              <button
                onClick={() => setTab("passkey")}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "passkey" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              >
                <Fingerprint className="w-4 h-4" />
                Biometria / Passkey
              </button>
            </div>

            <div className="p-6">
              {/* ── TOTP Tab ── */}
              {tab === "totp" && (
                <div className="space-y-5">
                  {totpStep === "idle" && (
                    <>
                      <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <Key className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                        <div className="text-sm text-blue-700">
                          <p className="font-semibold">App Autenticador (TOTP)</p>
                          <p className="mt-1 text-blue-600/80">Use Google Authenticator, Authy ou outro app compatível para gerar códigos de 6 dígitos.</p>
                        </div>
                      </div>
                      {totpConfigured ? (
                        <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                          <Check className="w-5 h-5 text-emerald-500" />
                          <span className="text-sm font-medium text-emerald-700">TOTP configurado e ativo</span>
                        </div>
                      ) : (
                        <button
                          onClick={startTotpSetup}
                          disabled={totpLoading}
                          className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg disabled:opacity-50"
                        >
                          {totpLoading ? "Gerando..." : "Configurar App Autenticador"}
                        </button>
                      )}
                    </>
                  )}

                  {totpStep === "verify" && (
                    <div className="space-y-5">
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-4">Escaneie o QR Code no seu app autenticador</p>
                        <div className="inline-block p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                          { }
                          <img src={qrDataUrl} alt="QR Code TOTP" className="w-56 h-56" />
                        </div>
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 font-mono break-all select-all max-w-sm mx-auto">
                          {totpSecret}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Se não conseguir escanear, digite a chave manualmente</p>
                      </div>

                      {totpError && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {totpError}
                        </div>
                      )}

                      <div>
                        <p className="text-sm text-gray-600 text-center mb-3">Digite o código de 6 dígitos para confirmar</p>
                        <div className="flex justify-center">
                          <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} onComplete={verifyTotpSetup}>
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
                      </div>

                      <button
                        onClick={verifyTotpSetup}
                        disabled={totpCode.length !== 6 || totpLoading}
                        className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg disabled:opacity-50"
                      >
                        {totpLoading ? "Verificando..." : "Confirmar e Ativar"}
                      </button>

                      <button
                        onClick={() => { setTotpStep("idle"); setQrDataUrl(""); setTotpSecret(""); setTotpCode(""); }}
                        className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Passkey Tab ── */}
              {tab === "passkey" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <Fingerprint className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-700">
                      <p className="font-semibold">Biometria / Passkey</p>
                      <p className="mt-1 text-blue-600/80">Use impressão digital, Face ID ou PIN do dispositivo para login rápido e seguro.</p>
                    </div>
                  </div>

                  {webauthnSuccess && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <Check className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">Passkey registrada com sucesso!</span>
                    </div>
                  )}

                  {webauthnError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {webauthnError}
                    </div>
                  )}

                  <button
                    onClick={registerPasskey}
                    disabled={webauthnLoading}
                    className="w-full h-11 rounded-xl bg-[#0D1B2A] to-gray-700 text-white font-semibold text-sm hover:from-gray-800 hover:to-gray-600 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {webauthnLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Registrar Novo Dispositivo</>
                    )}
                  </button>

                  {/* Lista de passkeys */}
                  {passkeys.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-gray-700">Dispositivos registrados</h4>
                      {passkeys.map((pk) => (
                        <div key={pk.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                              <Fingerprint className="w-4 h-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{pk.device_name}</p>
                              <p className="text-xs text-gray-400">Registrado em {new Date(pk.created_at).toLocaleDateString("pt-BR")}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => deletePasskey(pk.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      {/* Delete passkey confirmation */}
      <ConfirmDialog
        open={!!deletePasskeyId}
        title="Remover dispositivo"
        description="Tem certeza que deseja remover este dispositivo? Você precisará registrá-lo novamente para usá-lo no login."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={confirmDeletePasskey}
        onCancel={() => setDeletePasskeyId(null)}
        loading={deletePasskeyLoading}
      />
    </div>
  );
}