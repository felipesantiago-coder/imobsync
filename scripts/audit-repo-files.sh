#!/bin/bash
# Lista todos os arquivos rastreados no git com tamanho em bytes, ordenados por tamanho
cd /home/z/my-project
git ls-tree -r -l HEAD | while read mode_type sha size name; do
  # Se size estiver vazio (diretório/tree), pular
  if [ -z "$size" ] || [ "$size" = "-" ]; then continue; fi
  echo "${size} ${name}"
done | sort -rn
