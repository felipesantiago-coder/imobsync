/**
 * Serviço de notificação por e-mail em novo dispositivo.
 * 
 * Usa Resend (gratuito: 3.000 e-mails/mês, 100/dia).
 * Para ativar, defina RESEND_API_KEY no .env e configure o domínio no Resend.
 * 
 * Se RESEND_API_KEY não estiver configurado, faz log do e-mail que seria enviado.
 */

interface LoginNotificationData {
  to: string;
  displayName?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

export async function sendNewDeviceEmail(data: LoginNotificationData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    // Modo sem API key: loga o que seria enviado (para debug)
    console.log("[MFA Email] RESEND_API_KEY não configurada. E-mail que seria enviado:", JSON.stringify(data, null, 2));
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: "ImobSync <seguranca@fluxoquadra.com.br>",
      to: data.to,
      subject: "[ImobSync] Novo acesso detectado na sua conta",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0D1B2A;">Novo acesso detectado</h2>
          <p>Olá${data.displayName ? ` ${escapeHtml(data.displayName)}` : ""},</p>
          <p>Um novo acesso à sua conta no <strong>ImobSync</strong> foi detectado:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Data/Hora</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${data.timestamp}</td>
            </tr>
            ${data.ip ? `<tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Endereço IP</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>${data.ip}</code></td>
            </tr>` : ""}
            ${data.userAgent ? `<tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Navegador</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(data.userAgent)}</td>
            </tr>` : ""}
          </table>
          <p style="color: #6b7280; font-size: 14px;">Se você não reconhece esse acesso, considere alterar sua senha e ativar a autenticação de dois fatores nas configurações de segurança.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Esta é uma notificação automática do ImobSync. Não responda a este e-mail.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[MFA Email] Erro ao enviar notificação:", err);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Registra um evento de login no banco e envia notificação por e-mail
 * caso seja detectado um dispositivo novo.
 */
export async function recordLoginEvent(params: {
  userId: string;
  userAgent: string | null;
  ip: string;
}): Promise<void> {
  const supabase = await import("@/lib/supabase/server").then(m => m.createClient());
  const fingerprint = fingerprintDevice(params.userAgent);

  // Inserir o evento de login
  await supabase.from("user_login_events").insert({
    user_id: params.userId,
    ip: params.ip,
    user_agent: params.userAgent || null,
    device_fingerprint: fingerprint,
  });

  // Verificar se é um dispositivo novo para este usuário
  const { data: previousEvents } = await supabase
    .from("user_login_events")
    .select("device_fingerprint")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(2);

  const isNewDevice =
    !previousEvents ||
    previousEvents.length <= 1 ||
    previousEvents[0]?.device_fingerprint !== previousEvents[1]?.device_fingerprint;

  if (isNewDevice) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", params.userId)
      .single();

    if (profile?.email) {
      await sendNewDeviceEmail({
        to: profile.email,
        displayName: profile.display_name || undefined,
        ip: params.ip !== "unknown" ? params.ip : undefined,
        userAgent: params.userAgent || undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export function fingerprintDevice(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  // Extrair partes mais estáveis do UA
  const parts = userAgent.match(/\([^)]+\)/)?.[0] || userAgent;
  // Hash simples
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    const char = parts.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
