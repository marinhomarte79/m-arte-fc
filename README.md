# M ARTE FC Match Analyst

Registo ao vivo e análise estatística de jogos de futebol, para vários clubes.
Desenvolvido para a **M Arte Design** (Esposende).

- **Alojamento:** GitHub Pages (este repositório, ramo `main`).
- **Dados e logins:** Supabase, projecto `m-arte-fc`. Cada clube só vê os seus dados (regras RLS na base de dados).
- **Relatório IA:** função de servidor `ai-report` no Supabase. A chave da IA fica guardada no servidor (`ANTHROPIC_API_KEY`), nunca no navegador.

## Perfis
| Perfil | Pode |
| --- | --- |
| Super-admin (M Arte Design) | Criar e suspender clubes, mensalidades, IA por clube, todos os utilizadores, cópias de segurança |
| Admin do clube | Equipa técnica e acessos, equipas/escalões, trancar jogos, tudo o que o treinador faz |
| Treinador / Analista | Registar jogos, plantel, análise, relatório IA |
| Só leitura | Consultar análises |

## Ficheiros
`index.html` · `styles.css` · `app.js` · `config.js` (URL e chave pública do Supabase) · `supabase.js` (biblioteca, versão 2.45.4).
