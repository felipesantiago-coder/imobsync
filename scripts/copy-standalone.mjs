#!/usr/bin/env node
/**
 * copy-standalone.mjs — prepara o output standalone para self-hosting.
 *
 * Usado apenas por `npm run build:standalone` (NEXT_OUTPUT=standalone).
 * O build padrão (`npm run build`) NÃO produz standalone: na Vercel o
 * adaptador nativo usa o output do próprio Next, e um diretório standalone
 * de ~65 MB dentro do output inflaria o Deployment Storage sem função.
 *
 * Equivalente ao antigo:
 *   cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
 */
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), ".next");
const standalone = resolve(root, "standalone");

if (!existsSync(standalone)) {
  console.error(
    "[copy-standalone] .next/standalone não encontrado. Execute com NEXT_OUTPUT=standalone (npm run build:standalone)."
  );
  process.exit(1);
}

cpSync(resolve(root, "static"), resolve(standalone, ".next", "static"), { recursive: true });
cpSync(resolve(process.cwd(), "public"), resolve(standalone, "public"), { recursive: true });

console.log("[copy-standalone] public e .next/static copiados para .next/standalone.");
