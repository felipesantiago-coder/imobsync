/**
 * Testes de caracterização dos mappers de unidades (audit P1.4).
 *
 * Os mappers foram extraídos verbatim dos dashboards antes de qualquer
 * refatoração; estes testes fixam o comportamento golden da transformação
 * linha bruta do PostgREST → formato do dashboard.
 */
import { describe, it, expect } from "vitest";
import { mapRowToUnit, formatCurrency } from "@/lib/units-data";
import { mapRowToVillaBiancoUnit } from "@/lib/villa-bianco-data";
import { mapRowToMomentUnit } from "@/lib/moment-data";
import { mapRowToVittaUnit } from "@/lib/vitta-data";
import { mapProjetoUnitRow } from "@/lib/projeto-units";

describe("mapRowToUnit (sales / units)", () => {
  const fullRow = {
    andar: 3,
    unidade: 301,
    vagas: 2,
    area: "66.5",
    area_str: "66,5 m²",
    valor_venda: 1250000,
    tipo_area: "66m²",
    status: "reservado",
    posicao_solar: "Nascente",
    quartos: 2,
  };

  it("mapeia uma linha completa preservando campos e derivados", () => {
    const u = mapRowToUnit(fullRow);
    expect(u.andar).toBe(3);
    expect(u.unidade).toBe(301);
    expect(u.vagas).toBe(2);
    expect(u.area).toBe(66.5); // Number() sobre string do banco
    expect(u.areaStr).toBe("66,5 m²");
    expect(u.valorVenda).toBe(1250000);
    expect(u.valorStr).toBe("1.250.000,00");
    expect(u.valorFormatado).toBe(formatCurrency(1250000));
    expect(u.valorFormatado).toContain("R$");
    expect(u.tipoArea).toBe("66m²");
    expect(u.status).toBe("reservado");
    expect(u.posicaoSolar).toBe("Nascente");
    expect(u.quartos).toBe(2);
  });

  it("sem valor de venda usa fallbacks 'Consulte'", () => {
    const u = mapRowToUnit({ ...fullRow, valor_venda: null });
    expect(u.valorVenda).toBeNull();
    expect(u.valorStr).toBe("Consulte");
    expect(u.valorFormatado).toBe("Consulte o valor");
  });
});

describe("mapRowToVillaBiancoUnit", () => {
  const fullRow = {
    bloco: "B",
    andar: 5,
    unidade: 502,
    vagas: 2,
    area: "88.4",
    area_str: "88,4 m²",
    valor_venda: 2100000.5,
    tipologia: "Tipo 2",
    status: "disponivel",
    quartos: 3,
    is_cobertura: true,
    is_garden: false,
  };

  it("mapeia linha completa com flags de cobertura/garden", () => {
    const u = mapRowToVillaBiancoUnit(fullRow);
    expect(u.bloco).toBe("B");
    expect(u.andar).toBe(5);
    expect(u.unidade).toBe(502);
    expect(u.area).toBe(88.4);
    expect(u.areaStr).toBe("88,4 m²");
    expect(u.valorVenda).toBe(2100000.5);
    expect(u.valorStr).toBe("2.100.000,50");
    expect(u.valorFormatado).toContain("R$");
    expect(u.tipologia).toBe("Tipo 2");
    expect(u.status).toBe("disponivel");
    expect(u.quartos).toBe(3);
    expect(u.isCobertura).toBe(true);
    expect(u.isGarden).toBe(false);
  });

  it("sem valor de venda usa fallbacks 'Consulte'", () => {
    const u = mapRowToVillaBiancoUnit({ ...fullRow, valor_venda: null });
    expect(u.valorStr).toBe("Consulte");
    expect(u.valorFormatado).toBe("Consulte o valor");
  });
});

describe("mapRowToMomentUnit", () => {
  const fullRow = {
    andar: 2,
    unidade: 204,
    vagas: 1,
    area: "72.3",
    area_str: "72,3 m²",
    valor_venda: 980000,
    tipologia: "2 quartos",
    status: "vendido",
    quartos: 2,
    is_cobertura: false,
    posicao_solar: "Face Norte",
  };

  it("mapeia linha completa; sol vem de posicao_solar", () => {
    const u = mapRowToMomentUnit(fullRow);
    expect(u.andar).toBe(2);
    expect(u.unidade).toBe(204);
    expect(u.area).toBe(72.3);
    expect(u.valorVenda).toBe(980000);
    expect(u.valorStr).toBe("980.000,00");
    expect(u.valorFormatado).toContain("R$");
    expect(u.tipologia).toBe("2 quartos");
    expect(u.status).toBe("vendido");
    expect(u.quartos).toBe(2);
    expect(u.isCobertura).toBe(false);
    expect(u.sol).toBe("Face Norte");
  });

  it("sem valor de venda usa fallbacks 'Consulte'", () => {
    const u = mapRowToMomentUnit({ ...fullRow, valor_venda: null });
    expect(u.valorStr).toBe("Consulte");
    expect(u.valorFormatado).toBe("Consulte o valor");
  });
});

describe("mapRowToVittaUnit", () => {
  const fullRow = {
    bloco: "A",
    andar: "T2",
    andar_num: 2,
    unidade: 201,
    area: "95.1",
    area_str: "95,1 m²",
    valor_venda: 1500000,
    tipologia: "3 quartos",
    status: "disponivel",
  };

  it("mapeia linha completa com conversões Number() (porta exata)", () => {
    const u = mapRowToVittaUnit(fullRow);
    expect(u.bloco).toBe("A");
    expect(u.andar).toBe("T2");
    expect(u.andarNum).toBe(2);
    expect(u.unidade).toBe(201);
    expect(u.area).toBe(95.1);
    expect(u.areaStr).toBe("95,1 m²");
    expect(u.valorVenda).toBe(1500000);
    expect(u.valorStr).toBe(u.valorFormatado); // vitta usa o mesmo formatador para os dois
    expect(u.valorFormatado).toContain("R$");
    expect(u.status).toBe("disponivel");
    expect(u.tipo).toBe("3 quartos");
  });

  it("valor_venda null/ausente vira 0 via Number() — comportamento original preservado", () => {
    const u = mapRowToVittaUnit({ ...fullRow, valor_venda: null });
    expect(u.valorVenda).toBe(0);
  });
});

describe("mapProjetoUnitRow (dashboard dinâmico)", () => {
  const fullRow = {
    id: "u-1",
    empreendimento_id: "emp-uuid",
    andar: 4,
    unidade: "401",
    vagas: 2,
    area: 120.5,
    area_str: "120,5 m²",
    quartos: 3,
    valor_venda: 3200000,
    status: "reservado",
    posicao_solar: "Nascente",
    tipologia: "Tipo A",
    bloco: "Bloco 1",
    is_cobertura: false,
    is_garden: true,
    ordem: 12,
    created_at: "2026-01-01T00:00:00Z", // coluna extra do select(*) é ignorada
  };

  it("mapeia linha completa preservando snake_case", () => {
    const u = mapProjetoUnitRow(fullRow, "fallback-id");
    expect(u.id).toBe("u-1");
    expect(u.empreendimento_id).toBe("emp-uuid");
    expect(u.andar).toBe(4);
    expect(u.unidade).toBe("401");
    expect(u.vagas).toBe(2);
    expect(u.area).toBe(120.5);
    expect(u.area_str).toBe("120,5 m²");
    expect(u.quartos).toBe(3);
    expect(u.valor_venda).toBe(3200000);
    expect(u.status).toBe("reservado");
    expect(u.posicao_solar).toBe("Nascente");
    expect(u.tipologia).toBe("Tipo A");
    expect(u.bloco).toBe("Bloco 1");
    expect(u.is_cobertura).toBe(false);
    expect(u.is_garden).toBe(true);
    expect(u.ordem).toBe(12);
  });

  it("aplica defaults originais em linha mínima e usa fallback de empreendimento_id", () => {
    const u = mapProjetoUnitRow({ id: "u-2", unidade: "G1" }, "fallback-id");
    expect(u.empreendimento_id).toBe("fallback-id");
    expect(u.andar).toBeNull();
    expect(u.unidade).toBe("G1");
    expect(u.vagas).toBeNull();
    expect(u.area).toBeNull();
    expect(u.area_str).toBe("");
    expect(u.quartos).toBeNull();
    // Cast original `row.valor_venda as number | null` NÃO converte chave
    // ausente em null — undefined passa direto (comportamento original fixado)
    expect(u.valor_venda).toBeUndefined();
    expect(u.status).toBe("disponivel");
    expect(u.posicao_solar).toBe("");
    expect(u.tipologia).toBe("");
    expect(u.bloco).toBe("");
    expect(u.is_cobertura).toBe(false);
    expect(u.is_garden).toBe(false);
    expect(u.ordem).toBe(0);
  });

  it("unidade ausente vira string vazia via String(?? \"\")", () => {
    const u = mapProjetoUnitRow({ id: "u-3" }, "fallback-id");
    expect(u.unidade).toBe("");
  });
});
