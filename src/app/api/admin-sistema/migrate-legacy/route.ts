import { NextResponse } from "next/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Projetos legacy que devem existir no banco
const LEGACY_PROJECTS = [
  {
    nome: "Quattre Istambul",
    slug: "quattre-istambul",
    regiao: "Sobradinho",
    descricao: "72 unidades • 6 andares • 4 tipologias",
    imagem_url: "/quattre-istambul-preview.webp",
  },
  {
    nome: "Villa Bianco",
    slug: "villa-bianco",
    regiao: "Park Sul",
    descricao: "123 unidades • 4 blocos • 8 tipologias",
    imagem_url: "/villa-bianco-preview.webp",
  },
  {
    nome: "Moment",
    slug: "moment",
    regiao: "Noroeste",
    descricao: "72 unidades • 6 andares • 4 tipologias",
    imagem_url: "/moment-preview.webp",
  },
  {
    nome: "Residencial Vitta",
    slug: "residencial-vitta",
    regiao: "Ceilândia",
    descricao: "297 unidades • 2 blocos • 5 tipologias",
    imagem_url: null,
  },
];

export async function POST() {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    // Buscar slugs já existentes no banco
    const { data: existing } = await supabase
      .from("empreendimentos")
      .select("slug");

    const existingSlugs = new Set(
      (existing || []).map((e: { slug: string }) => e.slug)
    );

    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const proj of LEGACY_PROJECTS) {
      if (existingSlugs.has(proj.slug)) {
        skipped.push(proj.nome);
        continue;
      }

      const { error: err } = await supabase.from("empreendimentos").insert({
        nome: proj.nome,
        slug: proj.slug,
        regiao: proj.regiao,
        descricao: proj.descricao,
        imagem_url: proj.imagem_url,
        ativo: true,
      });

      if (err) {
        console.error(`Erro ao migrar ${proj.nome}:`, err.message);
        skipped.push(`${proj.nome} (erro: ${err.message})`);
      } else {
        inserted.push(proj.nome);
      }
    }

    return NextResponse.json({
      message: "Migração concluída",
      inserted,
      skipped,
    });
  } catch (err) {
    console.error("Erro na migração legacy:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
