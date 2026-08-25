"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Building2,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  FileSpreadsheet,
  MapPin,
  ArrowLeft,
  LogOut,
  X,
  Check,
  AlertCircle,
  Loader2,
  Shield,
  Users,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  Calculator,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/confirm-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

// Code-split heavy tab components — only loaded when the tab is active
const AssinaturasTab = dynamic(() => import("./AssinaturasTab"), { ssr: false });
const CuponsTab = dynamic(() => import("./CuponsTab"), { ssr: false });
const MetricasTab = dynamic(() => import("./MetricasTab"), { ssr: false });
const CoordenadorEmpreendimentosModal = dynamic(() => import("@/components/CoordenadorEmpreendimentosModal"), { ssr: false });
const SimuladorConfigModal = dynamic(() => import("./SimuladorConfigModal"), { ssr: false });

type AdminTab = "empreendimentos" | "usuarios" | "assinaturas" | "cupons" | "metricas";

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  must_change_password: boolean;
  must_setup_mfa: boolean;
  mfa_enabled: boolean;
  created_at: string;
}

interface Empreendimento {
  id: string;
  nome: string;
  slug: string;
  regiao: string;
  imagem_url: string | null;
  descricao: string;
  ativo: boolean;
  unit_count: number;
  created_at: string;
}

// ─── Toast state ─────────────────────────────────────────────────────────────
interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminSistemaClient() {
  const router = useRouter();
  const supabaseRef = React.useRef(createClient());
  const supabase = supabaseRef.current;

  // Data
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: "", regiao: "", descricao: "" });
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Empreendimento | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Simulador config
  const [simuladorConfigTarget, setSimuladorConfigTarget] = useState<{ id: string; nome: string } | null>(null);

  // Upload states keyed by empreendimento id
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const [uploadingExcel, setUploadingExcel] = useState<Record<string, boolean>>({});

  // Tab
  const [activeTab, setActiveTab] = useState<AdminTab>("empreendimentos");

  // Assinaturas
  const [assinaturas, setAssinaturas] = useState<Record<string, unknown>[]>([]);
  const [assinaturasLoading, setAssinaturasLoading] = useState(false);
  const [planosAdmin, setPlanosAdmin] = useState<Record<string, unknown>[]>([]);
  const [syncingPlano, setSyncingPlano] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [statusChangeDialog, setStatusChangeDialog] = useState<{ id: string; currentStatus: string } | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [statusMotivo, setStatusMotivo] = useState("");
  // Plano CRUD
  const [savingPlano, setSavingPlano] = useState(false);
  const [deletingPlano, setDeletingPlano] = useState<string | null>(null);
  const [togglingPlano, setTogglingPlano] = useState<string | null>(null);

  // Usuários
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ email: "", displayName: "", role: "comum" as "comum" | "coordenador" | "admin_sistema" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdUserPassword, setCreatedUserPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Generic confirmation dialog
  interface ConfirmActionState {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "warning" | "default";
    onConfirm: () => void;
  }
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  // Coordenador empreendimentos modal
  const [empModalUser, setEmpModalUser] = useState<{ id: string; nome: string } | null>(null);

  // Delete user confirmation
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  // ─── Auto-migrate legacy projects (roda em background, não bloqueia carregamento) ─
  const migrateLegacy = useCallback(async () => {
    try {
      await fetch("/api/admin-sistema/migrate-legacy", { method: "POST" });
    } catch {
      // Silently fail — os projetos podem já estar migrados
    }
  }, []);

  // ─── Fetch empreendimentos ─────────────────────────────────────────────────
  const fetchEmpreendimentos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin-sistema/empreendimentos");
      if (!res.ok) throw new Error("Erro ao buscar empreendimentos");
      const json = await res.json();
      setEmpreendimentos(Array.isArray(json.empreendimentos) ? json.empreendimentos : []);
    } catch (err) {
      console.error(err);
      addToast("error", "Erro ao carregar empreendimentos");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // ─── Fetch assinaturas ──────────────────────────────────────────
  const fetchAssinaturas = useCallback(async () => {
    try {
      setAssinaturasLoading(true);
      const res = await fetch("/api/admin-sistema/assinaturas");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setAssinaturas(json.assinaturas || []);
    } catch {
      addToast("error", "Erro ao carregar assinaturas");
    } finally {
      setAssinaturasLoading(false);
    }
  }, [addToast]);

  // ─── Fetch planos admin ─────────────────────────────────────────
  const fetchPlanosAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-sistema/planos");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPlanosAdmin(json.planos || []);
    } catch {
      addToast("error", "Erro ao carregar planos");
    }
  }, [addToast]);

  // ─── Sync plano com Mercado Pago (com confirmação) ───────────────
  const handleSyncPlanoRequest = useCallback((planoId: string, planoNome: string) => {
    setConfirmAction({
      title: "Sincronizar com Mercado Pago?",
      description: `O plano "${planoNome}" será criado/atualizado no Mercado Pago. Isso pode afetar assinaturas em andamento.`,
      confirmLabel: "Sincronizar",
      variant: "warning",
      onConfirm: () => {
        setConfirmAction(null);
        handleSyncPlano(planoId);
      },
    });
  }, []);

  const handleSyncPlano = useCallback(async (planoId: string) => {
    setSyncingPlano(planoId);
    try {
      const res = await fetch("/api/admin-sistema/planos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planoId }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", `Plano sincronizado! MP ID: ${json.mercadopago_plan_id}`);
        await fetchPlanosAdmin();
      } else {
        addToast("error", json.error || "Erro ao sincronizar plano.");
      }
    } catch {
      addToast("error", "Erro ao sincronizar com Mercado Pago.");
    } finally {
      setSyncingPlano(null);
    }
  }, [addToast, fetchPlanosAdmin]);

  // ─── Alterar status de assinatura ────────────────────────────────
  const handleOpenStatusChange = useCallback((id: string, current: string) => {
    setStatusChangeDialog({ id, currentStatus: current });
    setNewStatus("");
    setStatusMotivo("");
  }, []);

  const handleConfirmStatusChange = useCallback(async () => {
    if (!statusChangeDialog || !newStatus) return;
    setChangingStatus(statusChangeDialog.id);
    try {
      const res = await fetch("/api/admin-sistema/assinaturas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assinaturaId: statusChangeDialog.id, status: newStatus, motivo: statusMotivo }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", json.message || "Status atualizado.");
        setStatusChangeDialog(null);
        await fetchAssinaturas();
      } else {
        addToast("error", json.error || "Erro ao atualizar status.");
      }
    } catch {
      addToast("error", "Erro ao atualizar status.");
    } finally {
      setChangingStatus(null);
    }
  }, [statusChangeDialog, newStatus, statusMotivo, addToast, fetchAssinaturas]);

  // ─── Plano CRUD ─────────────────────────────────────────────────
  const handleSavePlano = useCallback(async (data: Record<string, unknown>) => {
    setSavingPlano(true);
    try {
      const isEdit = !!data.id;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch("/api/admin-sistema/planos", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", isEdit ? "Plano atualizado!" : "Plano criado!");
        if (json.mp_plan_cleared) {
          addToast("error", "Preço/período alterado — re-sincronize com o MP.");
        }
        await fetchPlanosAdmin();
        return json;
      } else {
        addToast("error", json.error || "Erro ao salvar plano.");
        return null;
      }
    } catch {
      addToast("error", "Erro ao salvar plano.");
      return null;
    } finally {
      setSavingPlano(false);
    }
  }, [addToast, fetchPlanosAdmin]);

  const handleDeletePlano = useCallback(async (planoId: string) => {
    setDeletingPlano(planoId);
    try {
      const res = await fetch("/api/admin-sistema/planos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planoId }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", "Plano excluído.");
        await fetchPlanosAdmin();
      } else {
        addToast("error", json.error || "Erro ao excluir.");
      }
    } catch {
      addToast("error", "Erro ao excluir plano.");
    } finally {
      setDeletingPlano(null);
    }
  }, [addToast, fetchPlanosAdmin]);

  const handleTogglePlanoRequest = useCallback((planoId: string, currentAtivo: boolean, planoNome: string) => {
    const action = currentAtivo ? "desativar" : "ativar";
    setConfirmAction({
      title: `${currentAtivo ? "Desativar" : "Ativar"} plano?`,
      description: `O plano "${planoNome}" será ${action}ado. ${currentAtivo ? "Novos clientes não poderão assinar este plano." : "Ele ficará disponível para novas assinaturas."}`,
      confirmLabel: currentAtivo ? "Desativar" : "Ativar",
      variant: currentAtivo ? "danger" : "default",
      onConfirm: () => {
        setConfirmAction(null);
        handleTogglePlano(planoId, currentAtivo);
      },
    });
  }, []);

  const handleTogglePlano = useCallback(async (planoId: string, currentAtivo: boolean) => {
    setTogglingPlano(planoId);
    try {
      const res = await fetch("/api/admin-sistema/planos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planoId, ativo: !currentAtivo }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", !currentAtivo ? "Plano ativado." : "Plano desativado.");
        await fetchPlanosAdmin();
      } else {
        addToast("error", json.error || "Erro ao alterar plano.");
      }
    } catch {
      addToast("error", "Erro ao alterar plano.");
    } finally {
      setTogglingPlano(null);
    }
  }, [addToast, fetchPlanosAdmin]);

  // ─── Fetch usuários ──────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const res = await fetch("/api/admin-sistema/users");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setUsers(json.users || []);
    } catch {
      addToast("error", "Erro ao carregar usuários");
    } finally {
      setUsersLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, [supabase.auth]);

  // Buscar dados imediatamente; migrar legacy em background sem bloquear
  const hasMigrated = React.useRef(false);
  useEffect(() => {
    if (activeTab === "empreendimentos") {
      fetchEmpreendimentos();
      if (!hasMigrated.current) {
        hasMigrated.current = true;
        migrateLegacy(); // fire-and-forget, não bloqueia o fetch
      }
    } else if (activeTab === "assinaturas") {
      fetchAssinaturas();
      fetchPlanosAdmin();
    } else {
      fetchUsers();
    }
  }, [activeTab, migrateLegacy, fetchEmpreendimentos, fetchUsers, fetchAssinaturas, fetchPlanosAdmin]);

  // ─── Create empreendimento ─────────────────────────────────────────────────
  const handleCreate = async () => {
    const nome = createForm.nome.trim();
    const regiao = createForm.regiao.trim();
    if (!nome || !regiao) return;

    setCreating(true);
    try {
      const res = await fetch("/api/admin-sistema/empreendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          regiao,
          descricao: createForm.descricao.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erro ao criar empreendimento");
      }
      const created = await res.json();
      setEmpreendimentos((prev) => [...prev, { ...created, unit_count: 0 }]);
      setShowCreateModal(false);
      setCreateForm({ nome: "", regiao: "", descricao: "" });
      addToast("success", `"${nome}" criado com sucesso`);
    } catch (err) {
      addToast("error", (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // ─── Delete empreendimento ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin-sistema/empreendimentos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erro ao remover empreendimento");
      }
      setEmpreendimentos((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      addToast("success", `"${deleteTarget.nome}" removido com sucesso`);
    } catch (err) {
      addToast("error", (err as Error).message);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ─── Image upload ──────────────────────────────────────────────────────────
  const handleImageUploadRequest = (empId: string, empNome: string) => {
    setConfirmAction({
      title: "Substituir imagem do empreendimento?",
      description: `A imagem atual de "${empNome}" será substituída pela nova imagem. Deseja continuar?`,
      confirmLabel: "Selecionar imagem",
      variant: "default",
      onConfirm: () => {
        setConfirmAction(null);
        // Use setTimeout to ensure the confirm dialog closes before opening file picker
        setTimeout(() => handleImageUpload(empId), 100);
      },
    });
  };

  const handleImageUpload = async (empId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,.webp";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingImage((prev) => ({ ...prev, [empId]: true }));
      try {
        const fd = new FormData();
        fd.append("empreendimentoId", empId);
        fd.append("file", file);
        const res = await fetch("/api/admin-sistema/empreendimentos/upload-image", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Erro no upload da imagem");
        }
        const json = await res.json();
        setEmpreendimentos((prev) =>
          prev.map((emp) => (emp.id === empId ? { ...emp, imagem_url: json.imagem_url } : emp))
        );
        addToast("success", "Imagem carregada com sucesso");
      } catch (err) {
        addToast("error", (err as Error).message);
      } finally {
        setUploadingImage((prev) => ({ ...prev, [empId]: false }));
      }
    };
    input.click();
  };

  // ─── Excel upload ──────────────────────────────────────────────────────────
  const handleExcelUploadRequest = (empId: string, empNome: string) => {
    setConfirmAction({
      title: "Upload de planilha Excel?",
      description: `As unidades de "${empNome}" serão atualizadas com os dados da planilha. Unidades existentes podem ser inseridas, atualizadas ou ignoradas conforme os dados.`,
      confirmLabel: "Selecionar arquivo",
      variant: "warning",
      onConfirm: () => {
        setConfirmAction(null);
        setTimeout(() => handleExcelUpload(empId), 100);
      },
    });
  };

  const handleExcelUpload = async (empId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingExcel((prev) => ({ ...prev, [empId]: true }));
      try {
        const fd = new FormData();
        fd.append("empreendimentoId", empId);
        fd.append("file", file);
        const res = await fetch("/api/admin-sistema/empreendimentos/upload-excel", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Erro no upload do Excel");
        }
        const json = await res.json();
        const parts: string[] = [];
        if (json.inserted) parts.push(`${json.inserted} inseridas`);
        if (json.updated) parts.push(`${json.updated} atualizadas`);
        if (json.skipped) parts.push(`${json.skipped} ignoradas`);
        if (json.errors) parts.push(`${json.errors} com erro`);
        addToast("success", `Excel: ${parts.join(", ")} — ${json.total_units} unidades totais`);
        // Refresh to update unit counts
        fetchEmpreendimentos();
      } catch (err) {
        addToast("error", (err as Error).message);
      } finally {
        setUploadingExcel((prev) => ({ ...prev, [empId]: false }));
      }
    };
    input.click();
  };

  // ─── Alterar role de usuário (com confirmação) ────────────────────────
  const handleRoleChangeRequest = useCallback((userId: string, newRole: string, currentRole: string, userEmail: string) => {
    const roleLabels: Record<string, string> = { admin_sistema: "Admin", coordenador: "Coordenador", comum: "Comum" };
    const targetLabel = roleLabels[newRole] || newRole;
    const isAdmin = newRole === "admin_sistema";
    setConfirmAction({
      title: `Alterar função do usuário?`,
      description: `${userEmail} será alterado de "${roleLabels[currentRole] || currentRole}" para "${targetLabel}".${isAdmin ? " Isso concede acesso total ao painel administrativo." : ""}`,
      confirmLabel: isAdmin ? "Sim, conceder Admin" : "Confirmar alteração",
      variant: isAdmin ? "danger" : "warning",
      onConfirm: () => {
        setConfirmAction(null);
        handleRoleChange(userId, newRole);
      },
    });
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch("/api/admin-sistema/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erro ao alterar função");
      }
      const json = await res.json();
      // Atualizar o usuário na lista local
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: json.user.role } : u))
      );
      addToast("success", `Função de ${json.user.email || "usuário"} alterada para ${newRole === "admin_sistema" ? "Admin" : newRole === "coordenador" ? "Coordenador" : "Comum"}`);
    } catch (err) {
      addToast("error", (err as Error).message);
      // Reverter o select visual
      fetchUsers();
    } finally {
      setUpdatingRole((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // ─── Delete usuário ─────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      const res = await fetch("/api/admin-sistema/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: deleteUserTarget.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erro ao excluir usuário");
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserTarget.id));
      addToast("success", `Usuário ${deleteUserTarget.email} excluído permanentemente`);
      setDeleteUserTarget(null);
    } catch (err) {
      addToast("error", (err as Error).message);
    } finally {
      setDeletingUser(false);
    }
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Administração do <span className="text-gray-400 font-normal">Sistema</span></h1>
                <p className="text-[11px] text-gray-400 font-medium hidden sm:block">
                  {activeTab === "empreendimentos" ? "Gerenciar empreendimentos" : activeTab === "usuarios" ? "Gerenciar usuários" : activeTab === "assinaturas" ? "Gerenciar assinaturas e planos" : activeTab === "cupons" ? "Gerenciar cupons de desconto" : "Métricas de uso do sistema"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/projetos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Voltar aos Projetos</span>
                <span className="sm:hidden">Voltar</span>
              </a>
              <div className="w-px h-5 bg-gray-700 hidden sm:block" />
              <a
                href="/mfa-setup"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Segurança</span>
              </a>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* FIX #1: Tabs scrollable on mobile, with compact text */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit min-w-full sm:min-w-0">
            <button
              onClick={() => setActiveTab("empreendimentos")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "empreendimentos"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Empreendimentos
            </button>
            <button
              onClick={() => setActiveTab("usuarios")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "usuarios"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-4 h-4" />
              Usuários
            </button>
            <button
              onClick={() => setActiveTab("assinaturas")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "assinaturas"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              Assinaturas
            </button>
            <button
              onClick={() => setActiveTab("cupons")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "cupons"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" x2="7.01" y1="7" y2="7"/></svg>
              Cupons
            </button>
            <button
              onClick={() => setActiveTab("metricas")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "metricas"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Métricas
            </button>
          </div>
        </div>

        {/* ═══ TAB: Empreendimentos ═══ */}
        {activeTab === "empreendimentos" && (<>
        {/* Title + action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
            >
              Empreendimentos
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-sm text-gray-500 mt-1"
            >
              {loading ? "Carregando..." : `${empreendimentos.length} empreendimento${empreendimentos.length !== 1 ? "s" : ""} cadastrado${empreendimentos.length !== 1 ? "s" : ""}`}
            </motion.p>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-md rounded-xl h-11 px-5 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Novo Empreendimento
            </Button>
          </motion.div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden animate-pulse">
                <div className="h-44 bg-gray-200" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="h-4 bg-gray-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && empreendimentos.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-400">Nenhum empreendimento cadastrado</h3>
            <p className="text-sm text-gray-300 mt-1.5">
              Clique em &quot;Novo Empreendimento&quot; para começar
            </p>
          </motion.div>
        )}

        {/* Empreendimentos grid */}
        {!loading && empreendimentos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {empreendimentos.map((emp, index) => (
                <motion.div
                  key={emp.id}
                  layout
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.35, delay: 0.04 * index }}
                  className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden"
                >
                  {/* Image thumbnail */}
                  <div className="relative h-44 bg-gray-100 overflow-hidden">
                    {emp.imagem_url ? (
                      <img
                        src={emp.imagem_url}
                        alt={emp.nome}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                        <ImageIcon className="w-10 h-10 mb-2" />
                        <span className="text-xs font-medium">Sem imagem</span>
                      </div>
                    )}
                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    {/* Region badge */}
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">
                        <MapPin className="w-3 h-3" />
                        {emp.regiao}
                      </span>
                    </div>
                    {/* Unit count badge */}
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/90 text-gray-700 backdrop-blur-sm shadow-sm">
                        {emp.unit_count} unidade{emp.unit_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-gray-900 tracking-tight truncate">{emp.nome}</h3>
                        {emp.descricao && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{emp.descricao}</p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        emp.ativo
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}>
                        {emp.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 mt-2">
                      Criado em {formatDate(emp.created_at)}
                    </p>

                    {/* Action buttons */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {/* Upload image */}
                      <button
                        onClick={() => handleImageUploadRequest(emp.id, emp.nome)}
                        disabled={uploadingImage[emp.id]}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadingImage[emp.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {uploadingImage[emp.id] ? "Enviando..." : "Upload Imagem"}
                      </button>

                      {/* Upload Excel */}
                      <button
                        onClick={() => handleExcelUploadRequest(emp.id, emp.nome)}
                        disabled={uploadingExcel[emp.id]}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadingExcel[emp.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        )}
                        {uploadingExcel[emp.id] ? "Processando..." : "Upload Excel"}
                      </button>

                      {/* Acessar Espelho */}
                      <a
                        href={`/empreendimento/${emp.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-sm"
                      >
                        Acessar Espelho
                      </a>

                      {/* Configurar Simulador */}
                      <button
                        onClick={() => setSimuladorConfigTarget({ id: emp.id, nome: emp.nome })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Simulador
                      </button>

                      {/* Remover */}
                      <button
                        onClick={() => setDeleteTarget(emp)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-all ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        </>)}

        {/* ═══ TAB: Usuários ═══ */}
        {activeTab === "usuarios" && (
          <div className="space-y-6">
            {/* Title + action */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Usuários</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {usersLoading ? "Carregando..." : `${users.length} usuário${users.length !== 1 ? "s" : ""} cadastrado${users.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Button
                onClick={() => { setShowCreateUserModal(true); setCreatedUserPassword(""); setCreateUserForm({ email: "", displayName: "", role: "comum" }); }}
                className="flex items-center gap-2 bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-md rounded-xl h-11 px-5 text-sm font-semibold"
              >
                <UserPlus className="w-4 h-4" />
                Novo Usuário
              </Button>
            </div>

            {/* Loading */}
            {usersLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-48" />
                        <div className="h-3 bg-gray-100 rounded w-32" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Users table */}
            {!usersLoading && users.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Empreendimentos</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Segurança</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Criado em</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
                                {(u.display_name || u.email)[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{u.display_name || u.email.split("@")[0]}</p>
                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            {updatingRole[u.id] ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Salvando...
                              </span>
                            ) : (
                              <select
                                value={u.role}
                                onChange={(e) => handleRoleChangeRequest(u.id, e.target.value, u.role, u.email)}
                                disabled={u.id === currentUserId}
                                title={u.id === currentUserId ? "Você não pode alterar sua própria função" : `Alterar função de ${u.email}`}
                                className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-900/20 ${
                                  u.role === "admin_sistema"
                                    ? "bg-amber-100 text-amber-700"
                                    : u.role === "coordenador"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-gray-100 text-gray-600"
                                } ${u.id === currentUserId ? "opacity-60 cursor-not-allowed" : "hover:opacity-80"}`}
                              >
                                <option value="comum">Usuário Comum</option>
                                <option value="coordenador">Coordenador</option>
                                <option value="admin_sistema">Administrador</option>
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {u.role === "coordenador" ? (
                              <button
                                onClick={() => setEmpModalUser({ id: u.id, nome: u.display_name || u.email.split("@")[0] })}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                title="Gerenciar empreendimentos"
                              >
                                <Building2 className="w-3 h-3" />
                                Gerenciar
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {u.mfa_enabled ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  <Shield className="w-3 h-3" /> 2FA
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                                  Sem 2FA
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-gray-500">
                              {new Date(u.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.must_change_password ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Trocar senha</span>
                            ) : u.must_setup_mfa ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Configurar 2FA</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Ativo</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {u.id !== currentUserId && u.role !== 'admin_sistema' ? (
                              <button
                                onClick={() => setDeleteUserTarget(u)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title={`Excluir ${u.email}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!usersLoading && users.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-400">Nenhum usuário</h3>
                <p className="text-sm text-gray-300 mt-1.5">Clique em "Novo Usuário" para começar</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Assinaturas ═══ */}
        {activeTab === "assinaturas" && (<AssinaturasTab
          assinaturas={assinaturas}
          assinaturasLoading={assinaturasLoading}
          planosAdmin={planosAdmin}
          syncingPlano={syncingPlano}
          changingStatus={changingStatus}
          statusChangeDialog={statusChangeDialog}
          newStatus={newStatus}
          statusMotivo={statusMotivo}
          savingPlano={savingPlano}
          deletingPlano={deletingPlano}
          togglingPlano={togglingPlano}
          addToast={addToast}
          onSyncPlano={handleSyncPlanoRequest}
          onFetchAssinaturas={fetchAssinaturas}
          onFetchPlanos={fetchPlanosAdmin}
          onOpenStatusChange={handleOpenStatusChange}
          onConfirmStatusChange={handleConfirmStatusChange}
          onSetStatusChangeDialog={setStatusChangeDialog}
          onSetNewStatus={setNewStatus}
          onSetStatusMotivo={setStatusMotivo}
          onSavePlano={handleSavePlano}
          onDeletePlano={handleDeletePlano}
          onTogglePlano={handleTogglePlanoRequest}
        />)}

        {/* ═══ TAB: Cupons ═══ */}
        {activeTab === "cupons" && <CuponsTab addToast={addToast} planosAdmin={planosAdmin} />}

        {/* ═══ TAB: Métricas ═══ */}
        {activeTab === "metricas" && <MetricasTab addToast={addToast} />}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-400">
            Administração do Sistema • ImobSync
          </p>
        </div>
      </footer>

      {/* ── Delete User Confirmation Modal ──────────────────────────── */}
      <AnimatePresence>
        {deleteUserTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !deletingUser && setDeleteUserTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Excluir Conta de Usuário</h3>
                  <p className="text-xs text-gray-400">Esta ação não pode ser desfeita</p>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                    {(deleteUserTarget.display_name || deleteUserTarget.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{deleteUserTarget.display_name || deleteUserTarget.email.split("@")[0]}</p>
                    <p className="text-xs text-gray-400 truncate">{deleteUserTarget.email}</p>
                  </div>
                </div>
                <p className="text-sm text-red-600 font-medium">
                  A conta será excluída permanentemente, junto com todos os dados associados (assinaturas, histórico, etc.).
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                <button
                  onClick={() => !deletingUser && setDeleteUserTarget(null)}
                  disabled={deletingUser}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deletingUser}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingUser ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</>
                  ) : (
                    <><Trash2 className="w-4 h-4" /> Excluir Permanentemente</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Empreendimento Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Novo Empreendimento</h3>
                    <p className="text-xs text-gray-400">Preencha os campos abaixo</p>
                  </div>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nome <span className="text-red-400">*</span></label>
                  <input type="text" value={createForm.nome} onChange={(e) => setCreateForm((prev) => ({ ...prev, nome: e.target.value }))} placeholder="Ex: Quattre Istambul" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Região <span className="text-red-400">*</span></label>
                  <input type="text" value={createForm.regiao} onChange={(e) => setCreateForm((prev) => ({ ...prev, regiao: e.target.value }))} placeholder="Ex: Sobradinho, DF" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Descrição</label>
                  <input type="text" value={createForm.descricao} onChange={(e) => setCreateForm((prev) => ({ ...prev, descricao: e.target.value }))} placeholder="Breve descrição (opcional)" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                <button onClick={() => setShowCreateModal(false)} disabled={creating} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">Cancelar</button>
                <button onClick={handleCreate} disabled={creating || !createForm.nome.trim() || !createForm.regiao.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                  {creating ? (<><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>) : (<><Check className="w-4 h-4" /> Criar Empreendimento</>)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Confirmar Remoção</h3>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Tem certeza que deseja remover o empreendimento{" "}
                  <span className="font-bold text-gray-900">{deleteTarget.nome}</span>?
                </p>
                <p className="text-sm text-red-600 mt-2 font-medium">
                  Isso removerá também todas as unidades associadas.
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Removendo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create User Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowCreateUserModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Novo Usuário</h3>
                </div>
                <button onClick={() => setShowCreateUserModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {!createdUserPassword ? (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">E-mail</label>
                      <input
                        type="email"
                        value={createUserForm.email}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="usuario@email.com"
                        className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Nome de exibição (opcional)</label>
                      <input
                        type="text"
                        value={createUserForm.displayName}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder="Nome do usuário"
                        className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Função</label>
                      <select
                        value={createUserForm.role}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, role: e.target.value as "comum" | "coordenador" | "admin_sistema" }))}
                        className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                      >
                        <option value="comum">Usuário Comum</option>
                        <option value="coordenador">Coordenador</option>
                        <option value="admin_sistema">Administrador do Sistema</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded-xl border border-blue-100">
                      Uma senha temporária será gerada automaticamente. O usuário deverá definiu sua própria senha no primeiro acesso, além de configurar a autenticação em duas etapas.
                    </p>
                  </>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                      <Check className="w-7 h-7 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">Usuário criado com sucesso!</h4>
                      <p className="text-xs text-gray-500 mt-1">Compartilhe a senha temporária com o usuário:</p>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-gray-900 rounded-xl justify-center">
                      <code className={`text-white font-mono text-lg tracking-wider ${showPassword ? "" : "blur-sm select-none"}`}>
                        {createdUserPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(createdUserPassword); addToast("success", "Senha copiada!"); }}
                        className="text-gray-400 hover:text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 font-medium">
                      Esta senha será exibida apenas uma vez.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                {createdUserPassword ? (
                  <button
                    onClick={() => { setShowCreateUserModal(false); fetchUsers(); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 transition-all shadow-md"
                  >
                    Concluir
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowCreateUserModal(false)}
                      disabled={creatingUser}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (!createUserForm.email.includes("@")) {
                          addToast("error", "E-mail inválido");
                          return;
                        }
                        setCreatingUser(true);
                        try {
                          const res = await fetch("/api/admin-sistema/users/create", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: createUserForm.email,
                              displayName: createUserForm.displayName || undefined,
                              role: createUserForm.role,
                            }),
                          });
                          if (!res.ok) {
                            const json = await res.json();
                            throw new Error(json.error || "Erro ao criar usuário");
                          }
                          const json = await res.json();
                          setCreatedUserPassword(json.user.tempPassword);
                          addToast("success", `Usuário ${createUserForm.email} criado!`);
                        } catch (err) {
                          addToast("error", (err as Error).message);
                        } finally {
                          setCreatingUser(false);
                        }
                      }}
                      disabled={creatingUser || !createUserForm.email.includes("@")}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingUser ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><Check className="w-4 h-4" /> Criar Usuário</>}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Coordenador Empreendimentos Modal ─────────────────────── */}
      {empModalUser && (
        <CoordenadorEmpreendimentosModal
          coordenadorId={empModalUser.id}
          coordenadorNome={empModalUser.nome}
          onClose={() => setEmpModalUser(null)}
          onSaved={() => addToast("success", `Empreendimentos de ${empModalUser.nome} atualizados`)}
        />
      )}

      {/* ── Simulador Config Modal ────────────────────────────────── */}
      {simuladorConfigTarget && (
        <SimuladorConfigModal
          empreendimentoId={simuladorConfigTarget.id}
          empreendimentoNome={simuladorConfigTarget.nome}
          open={!!simuladorConfigTarget}
          onClose={() => setSimuladorConfigTarget(null)}
          onSave={() => addToast("success", `Simulador de ${simuladorConfigTarget.nome} configurado!`)}
        />
      )}



      {/* ── Generic Confirmation Dialog ────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirmar"}
        variant={confirmAction?.variant || "default"}
        onConfirm={() => { confirmAction?.onConfirm(); }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* ── Toast Notifications ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[400] flex flex-col gap-2 max-w-sm">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm ${
                toast.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {toast.type === "success" ? (
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <p className="text-sm font-medium">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

