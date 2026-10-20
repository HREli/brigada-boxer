-- =========================================================================
-- BRIGADA BOXER - Schema completo do banco de dados (Supabase / Postgres)
-- Execute este arquivo INTEIRO uma única vez em:
--   Supabase > SQL Editor > New query > colar tudo > Run
-- =========================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- FASE 1: Brigadistas
-- -------------------------------------------------------------------------
create table if not exists brigadistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text not null check (cargo in ('Coordenador','Líder de Área','Integrante')),
  area text not null check (area in (
    'FINANCEIRO','COMERCIAL','MARKETING','RH','LOGÍSTICA',
    'PÓS VENDAS','EXPEDIÇÃO E QUALIDADE','ALMOXARIFADO','ASSISTÊNCIA TÉCNICA'
  )),
  piso text not null check (piso in ('TÉRREO','1° ANDAR','2° ANDAR')),
  funcao text not null check (funcao in (
    'Socorrista','Combatente','Socorrista e Combatente',
    'Socorrista e Líder de Abandono','Combatente e Líder de Abandono',
    'Socorrista, Combatente e Líder de Abandono'
  )),
  foto_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- FASE 2: Atas de reunião + assinaturas
-- -------------------------------------------------------------------------
create table if not exists atas (
  id uuid primary key default gen_random_uuid(),
  data_reuniao date not null,
  conteudo text not null,
  arquivo_assinado_url text,
  created_at timestamptz not null default now()
);

create table if not exists ata_assinaturas (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references atas(id) on delete cascade,
  brigadista_id uuid not null references brigadistas(id) on delete cascade,
  assinado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ata_id, brigadista_id)
);

-- -------------------------------------------------------------------------
-- FASE 3: Plano de Ação (ações vêm da ATA ou são criadas manualmente)
-- -------------------------------------------------------------------------
create table if not exists acoes (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid references atas(id) on delete set null,
  descricao text not null,
  responsavel text not null,
  prazo date not null,
  data_conclusao date,
  status text not null default 'Em andamento' check (status in ('Em andamento','Atrasada','Concluída')),
  origem text not null default 'Manual' check (origem in ('ATA','Manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- FASE 4: Extintores, Hidrantes e Inspeções
-- -------------------------------------------------------------------------
create table if not exists extintores (
  id uuid primary key default gen_random_uuid(),
  identificador text not null,
  tipo text not null check (tipo in ('Pó Químico','Água','CO2')),
  tamanho text not null check (tamanho in ('Pequeno','Grande')),
  localizacao text not null,
  foto_url text,
  data_ultima_recarga date not null,
  data_vencimento date generated always as (data_ultima_recarga + interval '1 year') stored,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists hidrantes (
  id uuid primary key default gen_random_uuid(),
  localizacao text not null,
  possui_mangueira boolean not null default false,
  possui_esguicho boolean not null default false,
  possui_chave_unha boolean not null default false,
  foto_url text,
  data_ultimo_teste date not null,
  data_vencimento date generated always as (data_ultimo_teste + interval '1 year') stored,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inspecoes_extintor (
  id uuid primary key default gen_random_uuid(),
  extintor_id uuid not null references extintores(id) on delete cascade,
  data_inspecao date not null,
  conteudo_ok boolean,
  lacre_ok boolean,
  integridade_ok boolean,
  armazenamento_ok boolean,
  sinalizacao_ok boolean,
  observacoes text,
  brigadista1_id uuid references brigadistas(id),
  brigadista2_id uuid references brigadistas(id),
  arquivo_assinado_url text,
  created_at timestamptz not null default now()
);

create table if not exists inspecoes_hidrante (
  id uuid primary key default gen_random_uuid(),
  hidrante_id uuid not null references hidrantes(id) on delete cascade,
  data_inspecao date not null,
  mangueira_ok boolean,
  esguicho_ok boolean,
  chave_unha_ok boolean,
  integridade_ok boolean,
  sinalizacao_ok boolean,
  observacoes text,
  brigadista1_id uuid references brigadistas(id),
  brigadista2_id uuid references brigadistas(id),
  arquivo_assinado_url text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Segurança: como o app não usa login, liberamos leitura/escrita pública
-- via chave "anon". Isso é necessário para o app funcionar sem senha.
-- -------------------------------------------------------------------------
alter table brigadistas enable row level security;
alter table atas enable row level security;
alter table ata_assinaturas enable row level security;
alter table acoes enable row level security;
alter table extintores enable row level security;
alter table hidrantes enable row level security;
alter table inspecoes_extintor enable row level security;
alter table inspecoes_hidrante enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'brigadistas','atas','ata_assinaturas','acoes',
    'extintores','hidrantes','inspecoes_extintor','inspecoes_hidrante'
  ])
  loop
    execute format('drop policy if exists "public_all_%1$s" on %1$s;', t);
    execute format(
      'create policy "public_all_%1$s" on %1$s for all using (true) with check (true);', t
    );
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- Storage: marcar um bucket como "Public" só libera LEITURA dos arquivos.
-- Para permitir upload (INSERT) sem login, é preciso liberar também no
-- storage.objects, que tem seu próprio RLS.
-- -------------------------------------------------------------------------
drop policy if exists "public_read_fotos_documentos" on storage.objects;
create policy "public_read_fotos_documentos"
on storage.objects for select
using (bucket_id in ('fotos','documentos'));

drop policy if exists "public_insert_fotos_documentos" on storage.objects;
create policy "public_insert_fotos_documentos"
on storage.objects for insert
with check (bucket_id in ('fotos','documentos'));

drop policy if exists "public_update_fotos_documentos" on storage.objects;
create policy "public_update_fotos_documentos"
on storage.objects for update
using (bucket_id in ('fotos','documentos'));

drop policy if exists "public_delete_fotos_documentos" on storage.objects;
create policy "public_delete_fotos_documentos"
on storage.objects for delete
using (bucket_id in ('fotos','documentos'));

-- =========================================================================
-- ATUALIZAÇÃO 2026-10: colaboradores, documentos e reuniões (já aplicada)
-- =========================================================================
-- brigadistas passa a guardar todos os colaboradores:
--   novas colunas vinculo, departamento, e_brigadista (bool); piso = Localização;
--   cargo/funcao/area/piso opcionais; cargo+funcao obrigatórios se e_brigadista;
--   nome único (upper(btrim(nome))). Ninguém é excluído: usa-se ativo = false.
-- documentos: tipo ('Certificado de Formação','Atestado da Brigada','Outro'),
--   brigadista_id (opcional), titulo, data_emissao, data_validade, arquivo_url.
-- atas.tipo: 'Geral' | 'Lideres'.
-- acoes: origem ('Manual','Reunião Geral','Reunião de Líderes'),
--   encaminhamento ('Líderes','Pauta Geral','Ação Geral') para itens dos líderes,
--   ata_geral_id = Reunião Geral que recebeu o item. Pautas dispensam responsável/prazo.
