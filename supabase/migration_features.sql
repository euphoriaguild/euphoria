-- ============================================================================
-- Migração: Telefone obrigatório, Equipamentos do membro e Estatuto Interno
-- Rode este SQL no Supabase (SQL Editor) uma única vez.
-- ============================================================================

-- Telefone de contato (obrigatório no cadastro, formato brasileiro de celular)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Equipamentos do personagem (cadastrado manualmente por cada membro)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equip_set TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equip_weapon TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equip_accessory TEXT;

-- ============================================================================
-- Estatuto Interno da Guild (visível a todos, editável apenas por staff/admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS guild_statute (
  id         BIGSERIAL PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed inicial com o estatuto vigente (só insere se a tabela estiver vazia)
INSERT INTO guild_statute (content, updated_by)
SELECT $$================== ESTATUTO INTERNO - GUILD EUPHORIA ==================

Nota da Liderança: O crescimento da Euphoria depende da disciplina e colaboração de todos. O uso do cupom e a presença nos eventos garantem o retorno em prêmios para você.

CAPÍTULO I - Da Composição e Admissão

Art. 1º – São considerados membros integrantes da Euphoria todos os jogadores que possuírem seus personagens principais vinculados à Guild e que participem ativamente de eventos e Bosses.
Art. 2º – Para admissão na Guild (Recrute), o candidato deve preencher os seguintes requisitos mínimos:
  I. Possuir no mínimo 200 Resets no personagem principal.
  II. Ter disponibilidade de horário para participação nos eventos coletivos.
  III. Possuir e utilizar obrigatoriamente o Discord para coordenação.

CAPÍTULO II - Do Código de Conduta e Convivência

Art. 3º – É terminantemente proibido o ataque (PK) contra membros da Euphoria ou suas contas secundárias (ALTs) alocadas na HellFire ou Euphoria2.
Art. 4º – O uso do Discord é obrigatório durante a execução de todos os eventos (BC, Illusion Temple e World Boss). A comunicação vocal ou auditiva é essencial para o sucesso das estratégias.
Art. 5º – É dever de todo membro buscar a evolução constante do personagem, visando atingir o máximo de resets possíveis para fortalecer a Guild.
Art. 6º – Protocolo de Comunicação em Eventos:
  §1º – Durante a realização de eventos, os membros devem restringir a comunicação ao máximo, mantendo o canal limpo.
  §2º – Deve-se priorizar a audição das orientações dos Líderes de PT.
  §3º – É terminantemente proibido interromper as calls ou poluir o áudio com assuntos paralelos durante a execução do evento.

CAPÍTULO III - Dos Eventos e Check-in

Art. 7º – A participação nos eventos é gerida via check-in no site da sala BC.
  §1º – O check-in abre 25 minutos antes do evento, limitado aos 10 primeiros, sendo 5 no servidor VIP e 5 no servidor PRINCIPAL.
  §2º – No Illusion Temple (Sala BC1), o check-in é com o Nick Principal, mas a entrada deve ser feita com a conta Principal + uma Secundária (ALT).
  §3º – Contas secundárias (ALTs) só entram no Blood Castle se não houver personagens principais interessados.

CAPÍTULO IV - Dos Requisitos para Participação em Drops

Art. 8º – Para estar apto a receber drops, participar da distribuição de itens ou sorteios de cashback, o membro deve cumprir um dos seguintes critérios de atividade:
  I. Ter realizado o mínimo de 5 resets diários; OU
  II. Possuir um personagem com 300+ resets.
  Parágrafo Único: Membros que não atingirem a meta de atividade diária ou o patamar de resets estipulado não terão direito à reivindicação de itens de eventos ou Bosses.

CAPÍTULO V - Das Penalidades

Art. 9º – O descumprimento do check-in sem aviso prévio acarreta suspensão de 24h a 1 semana.
Art. 10º – No Illusion Temple, se a ausência de um membro impedir o início do evento, este deverá restituir todas as entradas gastas pelos demais jogadores (diretamente ou via Baú da Guild).

CAPÍTULO VI - Da Distribuição de Drops e Itens

Art. 11º – Blood Castle: Cada player recebe suas boxes (2x +1, 2x +2, 2x +3).
Art. 12º – Illusion Temple: Cada player recebe boxes aleatórias (+1 a +5).
Art. 13º – World Boss: As Boxes obtidas serão contabilizadas e distribuídas aos participantes do evento mediante sorteio.
Art. 14º – Itens End Game (Raros (Armas, Shield e Asas lvl2)), oriundos das invasões de Dourados, Penas e Monarch:
  §1º – Antes de entregar o item raro para o membro, a Guild vai upar o item para +13 ou criar a Asa/Capa usando os materiais que droparam.
  §2º – A distribuição desses itens não será por sorteio livre. Terá prioridade quem estiver no topo dos seguintes critérios (um ajudando a somar pontos com o outro):
    I – Quem tiver os melhores itens atualmente (ou seja, quem estiver mais perto de precisar desse upgrade);
    II – Quem tiver mais resets e status no personagem;
    III – Quem tiver a maior participação em todos os Bosses da Guild.
  §3º – A distribuição funciona em Sistema de Cascata: o membro que ganhar o item novo é obrigado a passar o seu item antigo (o que foi substituído) para o próximo membro da lista que também cumpra os critérios.
  §4º – Se houver um empate total (membros com os mesmos itens, com status full e com a mesma participação no Boss), aí sim o item será decidido por meio de um sorteio feito apenas entre esses jogadores empatados.

Art. 15º – Das partes de Set com adicionais "Luck + Damage Decrease (DD)" oriundas da Box of Kundun +5 (Box 5):
  §1º – A participação na roleta (sorteio) desses itens é restrita exclusivamente aos membros que já possuam o seu set Tier 4 com os atributos Luck+DD já upados para o level +13.
  §2º – Critério de Prioridade por Progressão de Set: O membro que possuir a maior quantidade de peças prontas (Luck+DD+13) terá prioridade absoluta sobre o item dropado, caso seja a peça faltante para completar o seu set.
    Exemplo: Se um membro possui 3 peças prontas e faltam apenas Helm e Pants, ao dropar a Pants, o item será repassado diretamente a ele, sem a necessidade de roleta.
  §3º – Em caso de empate entre membros que precisem da mesma peça e que possuam exatamente a mesma quantidade de peças prontas do set, o item será decidido por roleta exclusivamente entre os membros empatados.

Art. 16º – Personagens principais têm prioridade absoluta sobre contas secundárias em qualquer distribuição.

CAPÍTULO VII - Gestão de Itens e Propriedade da Guild

Art. 17º – A Asa Level 2 e a Capa de DL são de propriedade coletiva da Guild Euphoria, ficando sob concessão de uso para o membro que atender aos critérios estabelecidos no Art. 14º, §2º, deste estatuto.
Art. 18º – Da Concessão de Uso (Carência): Ao receber um item raro da Guild, o membro detém apenas a concessão de uso pelo prazo de 45 dias.
  §1º – Durante este período, o item permanece como propriedade da Guild.
  §2º – Caso o membro saia da Guild antes do prazo de 45 dias, o item deve ser obrigatoriamente devolvido ao Baú da Guild.
  §3º – Após o cumprimento do prazo de 45 dias de permanência e atividade, a propriedade do item é transferida definitivamente ao player.$$, 'sistema'
WHERE NOT EXISTS (SELECT 1 FROM guild_statute);

NOTIFY pgrst, 'reload schema';
