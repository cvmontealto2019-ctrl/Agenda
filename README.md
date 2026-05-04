# Agenda de Decoração Biruta Park

Site separado para publicar em `decoracao.birutapark.com.br`.

## Rodar localmente

```bash
npm install
npm start
```

Sem `DATABASE_URL`, o sistema usa `data/store.json` localmente. Em produção, configure PostgreSQL para manter os dados após deploy.

## Deploy

No Render ou serviço similar:

- Build Command: `npm install`
- Start Command: `npm start`
- Variáveis:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `PGSSLMODE=require`

## Acesso inicial

- Link: `/agendadecoracao`
- Login: `decoracao`
- Senha: `Biruta@2026`

## Atualizações desta versão

- Projeto exclusivo da agenda de decoração.
- Raiz do domínio redireciona para `/agendadecoracao`.
- Cadastro da festa agora tem horário de início e horário de término.
- Informações de texto cadastradas são salvas em letra maiúscula.
