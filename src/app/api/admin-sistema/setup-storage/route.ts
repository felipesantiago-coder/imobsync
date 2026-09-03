import { NextResponse } from "next/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    // Criar o bucket via SQL direto (bypass da API de storage que exige service_role)
    const { error: sqlErr } = await supabase.rpc("create_empreendimentos_bucket");

    if (sqlErr) {
      // Se a função não existe ainda, tentar criar via insert direto
      if (sqlErr.message.includes("does not exist") || sqlErr.code === "42883") {
        // Fallback: tentar insert direto na tabela storage.buckets
        const { error: insertErr } = await supabase
          .from("storage.buckets")
          .insert({
            id: "empreendimentos",
            name: "empreendimentos",
            public: true,
            file_size_limit: 10485760,
          });

        if (insertErr) {
          // Verificar se já existe (erro de duplicata)
          if (insertErr.code === "23505") {
            return NextResponse.json({ message: "Bucket 'empreendimentos' já existe.", created: false });
          }
          console.error("Erro ao criar bucket (insert):", insertErr.message);
          return NextResponse.json(
            { error: `Não foi possível criar o bucket automaticamente. Erro: ${insertErr.message}` },
            { status: 500 }
          );
        }

        // Criar política de acesso público para leitura
        // Políticas podem já existir; falhas do exec_sql são ignoradas.
        try {
          await supabase.rpc("exec_sql", {
            query: `
            CREATE POLICY "empreendimentos_public_select" ON storage.objects
              FOR SELECT USING (bucket_id = 'empreendimentos');
            CREATE POLICY "empreendimentos_admin_insert" ON storage.objects
              FOR INSERT WITH CHECK (bucket_id = 'empreendimentos');
            CREATE POLICY "empreendimentos_admin_update" ON storage.objects
              FOR UPDATE USING (bucket_id = 'empreendimentos');
            CREATE POLICY "empreendimentos_admin_delete" ON storage.objects
              FOR DELETE USING (bucket_id = 'empreendimentos');
          `
          });
        } catch {
          // Políticas podem já existir, ignorar
        }

        return NextResponse.json({ message: "Bucket 'empreendimentos' criado com sucesso.", created: true });
      }

      console.error("Erro ao criar bucket (rpc):", sqlErr.message);
      return NextResponse.json(
        { error: `Erro ao criar bucket: ${sqlErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Bucket 'empreendimentos' criado com sucesso.", created: true });
  } catch (err) {
    console.error("Erro no setup-storage:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}