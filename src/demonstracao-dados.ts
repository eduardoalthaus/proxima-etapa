// Dados fictícios do modo demonstração: pessoas, empresas e vagas inventadas.
// As datas são relativas a hoje, para os avisos de "dias sem resposta" sempre aparecerem.
import type { Evento, Modelo, PerfilBusca, Sugestao, Vaga } from './lib'

export const USUARIO = { id: 'demo-usuario', email: 'marina@exemplo.com' }

const DIA = 86_400_000
const dia = (atras: number) => new Date(Date.now() - atras * DIA).toLocaleDateString('sv-SE')
const quando = (atras: number) => new Date(Date.now() - atras * DIA).toISOString()

type Base = Pick<Vaga, 'empresa' | 'cargo' | 'status'> & Partial<Vaga> & { dias?: number }

const VAGAS: (Base & { id: string })[] = [
  { id: 'v1', empresa: 'Ipê Analytics', cargo: 'Analista de Dados Pleno', status: 'entrevista', dias: 14, origem: 'Gupy', prioridade: 1, salario: 'R$ 7.500', contato: 'Juliana (Talent Acquisition)' },
  { id: 'v2', empresa: 'Nimbus Logística', cargo: 'Analista de BI', status: 'teste', dias: 9, origem: 'Sólides', salario: 'R$ 6.800' },
  { id: 'v3', empresa: 'Aurora Saúde Digital', cargo: 'Data Analyst', status: 'em_analise', dias: 16, origem: 'Remotive', salario: 'US$ 2.5k/mês' },
  { id: 'v4', empresa: 'Grão Fino Alimentos', cargo: 'Analista de Dados', status: 'aplicado', dias: 11, origem: 'Gupy', local: 'Híbrido · São Paulo/SP' },
  { id: 'v5', empresa: 'Vela Pagamentos', cargo: 'Analista de Dados Sênior', status: 'recusado', dias: 25, origem: 'LinkedIn' },
  { id: 'v6', empresa: 'Terra Viva Agro', cargo: 'Analista de Planejamento e Dados', status: 'aplicado', dias: 3, origem: 'Remotar' },
  { id: 'v7', empresa: 'Cobalto Seguros', cargo: 'Analista de Dados Pleno', status: 'oferta', dias: 30, origem: 'Gupy', prioridade: 1, salario: 'R$ 8.200 + PLR' },
  { id: 'v8', empresa: 'Mirante Educação', cargo: 'Analista de Indicadores', status: 'interesse', origem: 'Gupy', prioridade: 3 },
  { id: 'v9', empresa: 'Ponto Norte Varejo', cargo: 'Analista de Dados Jr', status: 'desistiu', dias: 20, origem: 'Sólides', prioridade: 3 },
  { id: 'v10', empresa: 'Lumen Energia', cargo: 'Analytics Engineer', status: 'interesse', origem: 'Himalayas', salario: 'US$ 40k–55k/ano' },
  { id: 'v11', empresa: 'Brisa Telecom', cargo: 'Analista de Dados', status: 'aplicado', dias: 8, origem: 'Gupy' },
  { id: 'v12', empresa: 'Carambola Tech', cargo: 'Analista de Produto (Dados)', status: 'em_analise', dias: 6, origem: 'GitHub' },
]

const EVENTOS: [vaga: string, tipo: Evento['tipo'], dias: number, descricao: string][] = [
  ['v1', 'aplicacao', 14, 'Candidatura enviada pela Gupy'],
  ['v1', 'resposta', 10, 'Gupy: Avançou de etapa (Etapa Fit Cultural desbloqueada)'],
  ['v1', 'teste', 8, 'Teste de SQL e Power BI entregue'],
  ['v1', 'entrevista', 2, 'Entrevista com a gestora marcada para quinta, 15h'],
  ['v2', 'aplicacao', 9, 'Candidatura enviada pela Sólides'],
  ['v2', 'teste', 4, 'Case técnico: painel de entregas atrasadas. Prazo de 5 dias'],
  ['v3', 'aplicacao', 16, 'Candidatura enviada pela Remotive'],
  ['v3', 'resposta', 12, 'Recrutadora pediu portfólio de dashboards'],
  ['v4', 'aplicacao', 11, 'Candidatura enviada pela Gupy'],
  ['v5', 'aplicacao', 25, 'Candidatura enviada'],
  ['v5', 'recusa', 18, 'Gupy: Processo encerrado (Obrigada pelo interesse em fazer parte do nosso time!)'],
  ['v6', 'aplicacao', 3, 'Candidatura enviada pela Remotar'],
  ['v7', 'aplicacao', 30, 'Candidatura enviada pela Gupy'],
  ['v7', 'entrevista', 20, 'Entrevista com RH'],
  ['v7', 'entrevista', 12, 'Entrevista técnica com o time de dados'],
  ['v7', 'oferta', 1, 'Proposta recebida: R$ 8.200 + PLR, resposta até sexta'],
  ['v9', 'aplicacao', 20, 'Candidatura enviada'],
  ['v9', 'nota', 15, 'Desisti: vaga presencial, 2h de deslocamento'],
  ['v11', 'aplicacao', 8, 'Candidatura enviada pela Gupy'],
  ['v12', 'aplicacao', 6, 'Candidatura enviada'],
  ['v12', 'follow_up', 2, 'Mandei mensagem para o recrutador no LinkedIn'],
]

const PERFIL: PerfilBusca = {
  user_id: USUARIO.id, nome: 'Marina Alves', nivel: 'pleno', modalidades: ['remoto', 'hibrido'],
  cidade: 'São Paulo', estado: 'São Paulo', abrangencia: 'cidade',
  curriculo_nome: 'curriculo-marina.pdf', curriculo_em: quando(20),
  termos_br: ['analista de dados', 'analista de bi'], termos_global: ['data analyst'],
  cargos: ['analista de dados', 'analista de bi', 'data analyst', 'analytics engineer', 'cientista de dados'],
  competencias: ['sql', 'python', 'power bi', 'excel avançado', 'looker', 'postgresql', 'indicadores', 'inglês'],
  excluir: ['jovem aprendiz', 'estágio', 'estagiário', 'estagiária', 'intern', 'internship', 'trainee'],
  nota_minima: 50, ultima_busca: quando(0.3),
}

const MODELOS: Modelo[] = [
  {
    id: 'm1', nome: 'Analista de Dados', padrao: true,
    palavras_chave: ['dados', 'data', 'analytics'], habilidades: ['SQL', 'Power BI', 'Python'],
    texto: 'Olá, time da %empresa%! Sou analista de dados há 5 anos e me interessei pela vaga de %cargo%. ' +
      'Hoje monto os painéis de vendas e operação de uma rede de varejo: modelo os dados em SQL, automatizo cargas em Python ' +
      'e entrego os indicadores no Power BI. O que mais gosto é transformar uma planilha que alguém atualiza à mão ' +
      'em um painel que se atualiza sozinho. Seria ótimo levar isso para a %empresa%.',
  },
  {
    id: 'm2', nome: 'Business Intelligence', padrao: false,
    palavras_chave: ['bi', 'business intelligence', 'indicadores'], habilidades: ['Modelagem de dados', 'Power BI', 'Indicadores'],
    texto: 'Olá! Trabalho com BI desde 2020, do levantamento com as áreas até o painel publicado. ' +
      'Na vaga de %cargo% vejo espaço para o que faço melhor: entender a pergunta do negócio antes de abrir o banco de dados.',
  },
]

type SugestaoBase = Omit<Sugestao, 'id' | 'estado' | 'created_at' | 'externo_id' | 'publicado_em'> & { dias: number }

const SUGESTOES: SugestaoBase[] = [
  { fonte: 'Gupy', titulo: 'Analista de Dados Pleno', empresa: 'Saberes Educação', url: 'https://example.com/vagas/saberes', local: 'Brasil (remoto)', resumo: null, salario: 'R$ 7.000 – R$ 8.500', nota: 89, motivos: ['cargo: analista de dados', 'sql, python, power bi', 'nível pleno', 'Brasil (remoto)'], dias: 0 },
  { fonte: 'Sólides', titulo: 'Analista de BI', empresa: 'Rota Sul Transportes', url: 'https://example.com/vagas/rota-sul', local: 'Híbrido · São Paulo/SP', resumo: null, salario: 'R$ 6.500', nota: 77, motivos: ['cargo: analista de bi', 'power bi, sql, indicadores', 'Híbrido · São Paulo/SP'], dias: 1 },
  { fonte: 'Remotive', titulo: 'Data Analyst (LATAM)', empresa: 'Tidewave', url: 'https://example.com/vagas/tidewave', local: 'LATAM', resumo: null, salario: 'US$ 30k–42k/ano', nota: 72, motivos: ['cargo: data analyst', 'sql, python, looker', 'aceita LATAM'], dias: 2 },
  { fonte: 'Remotar', titulo: 'Analista de Dados', empresa: 'Fazenda Digital', url: 'https://example.com/vagas/fazenda-digital', local: 'Brasil (remoto)', resumo: null, salario: null, nota: 68, motivos: ['cargo: analista de dados', 'excel avançado, sql', 'Brasil (remoto)'], dias: 3 },
  { fonte: 'Gupy', titulo: 'Analytics Engineer', empresa: 'Moinho Finanças', url: 'https://example.com/vagas/moinho', local: 'Brasil (remoto)', resumo: null, salario: null, nota: 66, motivos: ['cargo: analytics engineer', 'sql, python, postgresql', 'Brasil (remoto)'], dias: 4 },
  { fonte: 'Himalayas', titulo: 'Business Intelligence Analyst', empresa: 'Northbeam Labs', url: 'https://example.com/vagas/northbeam', local: 'Worldwide', resumo: null, salario: 'US$ 45k–60k/ano', nota: 58, motivos: ['menciona data analyst', 'sql, power bi, inglês', 'nível pleno'], dias: 5 },
  { fonte: 'GitHub', titulo: 'Analista de Dados na Colmeia Apps', empresa: 'Colmeia Apps', url: 'https://example.com/vagas/colmeia', local: 'Brasil (remoto)', resumo: null, salario: null, nota: 55, motivos: ['cargo: analista de dados', 'python, sql', 'Brasil (remoto)'], dias: 6 },
]

// O que o "Buscar agora" encontra na demonstração
const RESERVA: SugestaoBase[] = [
  { fonte: 'Gupy', titulo: 'Analista de Dados Pleno | Operações', empresa: 'Quintal Varejo', url: 'https://example.com/vagas/quintal', local: 'Brasil (remoto)', resumo: null, salario: 'R$ 7.800', nota: 84, motivos: ['cargo: analista de dados', 'sql, power bi, excel avançado', 'nível pleno', 'Brasil (remoto)'], dias: 0 },
  { fonte: 'Sólides', titulo: 'Cientista de Dados', empresa: 'Horizonte Saúde', url: 'https://example.com/vagas/horizonte', local: 'Brasil (remoto)', resumo: null, salario: null, nota: 63, motivos: ['cargo: cientista de dados', 'python, sql', 'Brasil (remoto)'], dias: 0 },
  { fonte: 'Jobicy', titulo: 'Junior Data Analyst', empresa: 'Brightloop', url: 'https://example.com/vagas/brightloop', local: 'Americas', resumo: null, salario: null, nota: 52, motivos: ['cargo: data analyst', 'sql, inglês'], dias: 0 },
]

const EMAILS: [vaga: string | null, tipo: string, dias: number, assunto: string][] = [
  ['v7', 'oferta', 1, 'Temos uma proposta para você!'],
  ['v1', 'entrevista', 2, 'Convite para entrevista - Analista de Dados Pleno'],
  ['v1', 'avanco', 10, 'Etapa Fit Cultural desbloqueada para a vaga Analista de Dados Pleno'],
  [null, 'candidatura', 12, 'Sua candidatura foi recebida'],
  ['v5', 'recusa', 18, 'Obrigada pelo interesse em fazer parte do nosso time!'],
]

export function dadosIniciais(): Record<string, Record<string, unknown>[]> {
  const sugestao = (s: SugestaoBase, i: number, prefixo: string) => {
    const { dias, ...resto } = s
    return { ...resto, id: `${prefixo}${i}`, externo_id: `${prefixo}${i}`, user_id: USUARIO.id, estado: 'nova', publicado_em: quando(dias), created_at: quando(dias) }
  }
  return {
    vagas: VAGAS.map(({ dias, ...v }) => ({
      link: null, origem: null, salario: null, local: 'Brasil (remoto)', prioridade: 2, contato: null, notas: null, ...v,
      user_id: USUARIO.id, data_aplicacao: v.status === 'interesse' || dias === undefined ? null : dia(dias),
      created_at: quando(dias ?? 2), updated_at: quando(dias === undefined ? 2 : Math.max(0, dias - 1)),
    })),
    eventos: EVENTOS.map(([vaga_id, tipo, dias, descricao], i) => ({
      id: `e${i}`, vaga_id, tipo, data: dia(dias), descricao, user_id: USUARIO.id, created_at: quando(dias),
    })),
    sugestoes: SUGESTOES.map((s, i) => sugestao(s, i, 's')),
    reserva: RESERVA.map((s, i) => sugestao(s, i, 'r')),
    perfil_busca: [{ ...PERFIL }],
    modelos: MODELOS.map(m => ({ ...m, user_id: USUARIO.id, created_at: quando(20) })),
    conexoes_email: [{ user_id: USUARIO.id, provedor: 'outlook', email: USUARIO.email, ultima_leitura: quando(0.05), erro: null }],
    emails_recebidos: EMAILS.map(([vaga_id, tipo, dias, assunto], i) => ({
      id: `em${i}`, user_id: USUARIO.id, recebido_em: quando(dias), assunto, trecho: null, tipo, vaga_id, aplicado: !!vaga_id,
    })),
    convites: [],
  }
}
