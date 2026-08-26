"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Building2, ArrowRight, LogOut, MapPin, Shield, ShieldAlert, X, ChevronDown, Fingerprint, QrCode, Crown, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MobileMenu from "@/components/MobileMenu";

type Region = string;

interface EmpreendimentoDB {
  id: string;
  nome: string;
  slug: string;
  regiao: string;
  imagem_url: string | null;
  descricao: string;
  ativo: boolean;
  unit_count: number;
}

// Mapeamento de slug para rota legada
const SLUG_ROUTE_MAP: Record<string, string> = {
  "quattre-istambul": "/espelho",
  "villa-bianco": "/villa-bianco",
  moment: "/moment",
  "residencial-vitta": "/vitta",
};

function getProjectHref(emp: EmpreendimentoDB): string {
  if (SLUG_ROUTE_MAP[emp.slug]) {
    return SLUG_ROUTE_MAP[emp.slug];
  }
  return `/empreendimento/${emp.id}`;
}

// Skeleton loading card
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="h-48 sm:h-56 bg-gray-200 animate-pulse" />
      <div className="p-5 sm:p-6 space-y-3">
        <div className="h-6 bg-gray-200 rounded-lg animate-pulse w-3/4" />
        <div className="h-4 bg-gray-100 rounded-lg animate-pulse w-1/2" />
        <div className="h-4 bg-gray-100 rounded-lg animate-pulse w-2/3" />
        <div className="pt-2 flex justify-between items-center">
          <div className="h-4 bg-gray-100 rounded-lg animate-pulse w-1/3" />
          <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

interface ProjetosClientProps {
  userRole: string;
  initialEmpreendimentos: EmpreendimentoDB[];
  initialMfaEnabled: boolean;
  lastUpdatedMap?: Record<string, string | null>;
  hasActivePlan?: boolean;
}

function formatLastUpdated(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (diffDays === 0) return `Hoje às ${time}`;
  if (diffDays === 1) return `Ontem às ${time}`;
  if (diffDays < 7) return `${diffDays} dias atrás`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + ` às ${time}`;
}

export default function ProjetosClient({ userRole, initialEmpreendimentos, initialMfaEnabled, lastUpdatedMap = {}, hasActivePlan = false }: ProjetosClientProps) {
  const router = useRouter();
  const [filterRegion, setFilterRegion] = useState<Region | "all">("all");
  const [projects, setProjects] = useState<EmpreendimentoDB[]>(initialEmpreendimentos);

  // MFA banner state
  const [showMfaBanner, setShowMfaBanner] = useState(false);
  const [mfaBannerExpanded, setMfaBannerExpanded] = useState(false);
  const [mfaChecked, setMfaChecked] = useState(false);

  // Dados já vieram do servidor — não precisa de fetch
  // Mas se os dados vieram vazios (tabela não populada), faz fetch como fallback
  useEffect(() => {
    if (initialEmpreendimentos.length > 0) return;
    async function fetchEmpreendimentos() {
      try {
        const res = await fetch("/api/empreendimentos");
        if (res.ok) {
          const data = await res.json();
          setProjects(data.empreendimentos || []);
        }
      } catch {
        // Silently fail
      }
    }
    fetchEmpreendimentos();
  }, [initialEmpreendimentos.length]);

  // MFA check: usa o valor do servidor (sem chamada extra)
  useEffect(() => {
    if (initialMfaEnabled) {
      setMfaChecked(true);
      return;
    }

    // Verificar se o usuário já dispensou o aviso recentemente (7 dias)
    const dismissed = localStorage.getItem("mfa_banner_dismissed");
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < sevenDays) {
        setMfaChecked(true);
        return;
      }
    }

    // MFA não habilitado — mostrar banner
    setShowMfaBanner(true);
    setMfaChecked(true);
  }, [initialMfaEnabled]);

  const allRegions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.regiao))),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    if (filterRegion === "all") return projects;
    return projects.filter((p) => p.regiao === filterRegion);
  }, [projects, filterRegion]);

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  const dismissMfaBanner = useCallback(() => {
    setShowMfaBanner(false);
    localStorage.setItem("mfa_banner_dismissed", new Date().toISOString());
  }, []);

  const isAdminSistema = userRole === "admin_sistema";
  const canSeeLastUpdated = isAdminSistema || userRole === "coordenador";
  const isLoading = projects.length === 0 && initialEmpreendimentos.length === 0;

  const mobileMenuItems = useMemo(() => [
    ...(isAdminSistema ? [{ label: "Administração", icon: <Shield className="w-5 h-5" />, href: "/admin-sistema" }] : []),
    ...(hasActivePlan ? [{ label: "Gerenciar plano", icon: <Crown className="w-5 h-5" />, href: "/assinatura" }] : [{ label: "Planos", icon: <Crown className="w-5 h-5" />, href: "/planos" }]),
    { label: "Segurança", icon: <Shield className="w-5 h-5" />, href: "/mfa-setup" },
    { label: "Sair", icon: <LogOut className="w-5 h-5" />, onClick: handleLogout, variant: "danger" as const },
  ], [handleLogout, isAdminSistema, hasActivePlan]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <Image
                src="/imobsync-icon-escuro-36.png"
                alt="Logo ImobSync"
                width={36}
                height={36}
                className="h-7 w-auto sm:h-9 rounded-lg"
              />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">
                  ImobSync <span className="text-gray-500 font-normal text-xs sm:text-sm">| Empreendimentos</span>
                </h1>
              </div>
            </div>
            {/* Desktop actions */}
            <div className="hidden sm:flex items-center gap-2">
              {isAdminSistema && (
                <a
                  href="/admin-sistema"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold transition-colors border border-amber-500/20"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Administração
                </a>
              )}
              {hasActivePlan ? (
                <a
                  href="/assinatura"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors border border-emerald-500/20"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Gerenciar plano
                </a>
              ) : (
                <a
                  href="/planos"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold transition-colors border border-amber-500/20"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Planos
                </a>
              )}
              <a
                href="/mfa-setup"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                Segurança
              </a>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
            {/* Mobile menu */}
            <MobileMenu items={mobileMenuItems} />
          </div>
        </div>
      </header>

      {/* MFA Security Banner */}
      {showMfaBanner && mfaChecked && (
        <div
          className="border-b border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50/80 to-orange-50/60 animate-[fadeSlideUp_0.4s_ease-out]"
        >
          <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-3">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-900">
                      Proteja sua conta com autenticação em duas etapas
                    </p>
                    <button
                      onClick={dismissMfaBanner}
                      className="p-1 text-amber-400 hover:text-amber-600 rounded-lg hover:bg-amber-100/60 transition-colors shrink-0"
                      title="Dispensar aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-amber-700/80 mt-0.5">
                    Sua conta ainda não possui segurança adicional. Configure agora em poucos passos.
                  </p>

                  {mfaBannerExpanded && (
                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-start gap-2.5 p-3 bg-white/70 rounded-xl border border-amber-100">
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">Acesse as configurações de segurança</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Clique no botão <span className="font-semibold text-gray-700">"Segurança"</span> no canto superior direito desta página.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 p-3 bg-white/70 rounded-xl border border-amber-100">
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">Escolha seu método preferido</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            <span className="inline-flex items-center gap-1 font-medium text-gray-600"><QrCode className="w-3 h-3" /> App Autenticador</span> — escaneie o QR Code com Google Authenticator ou Authy. Ou
                            <span className="inline-flex items-center gap-1 font-medium text-gray-600 ml-1"><Fingerprint className="w-3 h-3" /> Biometria</span> — use impressão digital ou Face ID do celular.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 p-3 bg-white/70 rounded-xl border border-amber-100">
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">Confirme e pronto!</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Para o app autenticador, digite o código de 6 dígitos. Para biometria, basta confirmar na tela. Após isso, seu login estará protegido.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <a
                          href="/mfa-setup"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors shadow-sm"
                        >
                          <Shield className="w-4 h-4" />
                          Configurar agora
                        </a>
                        <button
                          onClick={dismissMfaBanner}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-amber-700 hover:bg-amber-100/60 transition-colors"
                        >
                          Talvez depois
                        </button>
                      </div>
                    </div>
                  )}

                  {!mfaBannerExpanded && (
                    <button
                      onClick={() => setMfaBannerExpanded(true)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      Como configurar?
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Title section */}
          <div className="text-center mb-8 sm:mb-12">
            <h2
              className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight animate-[fadeSlideUp_0.5s_ease-out]"
            >
              Nossos Empreendimentos
            </h2>
            <p
              className="text-sm sm:text-base text-gray-500 mt-2 animate-[fadeSlideUp_0.5s_ease-out_0.1s]"
            >
              Selecione um empreendimento para acessar o espelho de vendas
            </p>
          </div>

          {/* Region filter */}
          {allRegions.length > 1 && (
            <div
              className="mb-8 animate-[fadeSlideUp_0.4s_ease-out_0.15s]"
            >
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Região:</span>
                <button
                  onClick={() => setFilterRegion("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                    filterRegion === "all"
                      ? "bg-gray-900 text-white border-gray-900 shadow-md"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  Todas
                </button>
                {allRegions.map((region) => (
                  <button
                    key={region}
                    onClick={() => setFilterRegion(region)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                      filterRegion === region
                        ? "bg-gray-900 text-white border-gray-900 shadow-md"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 text-center">
              <span className="font-bold text-gray-600">{filteredProjects.length}</span> empreendimento{filteredProjects.length !== 1 ? "s" : ""} encontrado{filteredProjects.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Project cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isLoading ? (
              // Skeleton loading
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                {filteredProjects.map((project, index) => {
                  const href = getProjectHref(project);
                  const description = project.descricao
                    || (project.unit_count > 0 ? `${project.unit_count} unidades` : "Empreendimento");

                  return (
                    <div
                      key={project.id}
                      className="animate-[fadeSlideUp_0.35s_ease-out]"
                      style={{ animationDelay: `${0.05 * index}s`, animationFillMode: 'both' }}
                    >
                      <a
                        href={href}
                        className="group block bg-white rounded-2xl shadow-md hover:shadow-2xl border border-gray-100 overflow-hidden transition-all duration-300 hover:-translate-y-1"
                      >
                        <div className="relative h-48 sm:h-56 overflow-hidden bg-gray-100">
                          {project.imagem_url ? (
                            <Image
                              src={project.imagem_url}
                              alt={`Preview ${project.nome}`}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              priority={index < 2}
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                              <Building2 className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                          <div className="absolute bottom-3 left-3">
                            <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm bg-white/15 text-white border border-white/20">
                              ImobSync
                            </span>
                          </div>
                          <div className="absolute top-3 right-3">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">
                              <MapPin className="w-3 h-3" />
                              {project.regiao}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 sm:p-6">
                          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight group-hover:text-gray-700 transition-colors">
                            {project.nome}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1.5">{project.regiao}</p>
                          <p className="text-sm text-gray-400 mt-1">{description}</p>
                          {canSeeLastUpdated && lastUpdatedMap[project.id] && (
                            <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                              <Clock className="w-3 h-3" />
                              Última atualização: {formatLastUpdated(lastUpdatedMap[project.id])}
                            </p>
                          )}
                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-500 group-hover:text-gray-900 transition-colors">
                              Acessar espelho
                            </span>
                            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-900 transition-all duration-300">
                              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                            </span>
                          </div>
                        </div>
                      </a>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Empty state */}
          {!isLoading && filteredProjects.length === 0 && (
            <div
              className="text-center py-16 animate-[fadeIn_0.4s_ease-out]"
            >
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400">Nenhum empreendimento nessa região</h3>
              <p className="text-sm text-gray-300 mt-1">
                Tente selecionar outra região ou{" "}
                <button
                  onClick={() => setFilterRegion("all")}
                  className="text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  ver todos
                </button>
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/90">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Building2 className="w-4 h-4" />
            <span className="font-semibold text-gray-600">ImobSync</span>
            <span>|</span>
            <span>Empreendimentos</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
