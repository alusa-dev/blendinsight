import type { Metadata } from "next";
import { LegalDocument } from "../_components/legal-document";

export const metadata: Metadata = {
  title: "Política de Privacidade | Blend Insight",
  description: "Como o Blend Insight acessa, utiliza, protege e elimina dados de contas conectadas.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Política de privacidade"
      title="Seus dados, tratados com clareza."
      intro="Esta política explica quais dados o Blend Insight utiliza para conectar uma conta profissional do Instagram ao ChatGPT e como solicitar sua exclusão."
    >
      <section>
        <h2>1 · Sobre o Blend Insight</h2>
        <p>Blend Insight é uma ferramenta pessoal que permite ao titular de uma conta profissional do Instagram consultar e administrar recursos da conta por meio de um servidor MCP conectado ao ChatGPT. O serviço não é uma plataforma de vendas nem comercializa dados pessoais.</p>
        <p>Para dúvidas ou solicitações sobre privacidade, escreva para <a href="mailto:gestao.alusa@gmail.com">gestao.alusa@gmail.com</a>.</p>
      </section>

      <section>
        <h2>2 · Dados utilizados</h2>
        <p>Conforme o método de acesso e as permissões aprovadas, o serviço pode processar:</p>
        <ul>
          <li>identificadores da conta do Instagram, nome de usuário e tipo de conta;</li>
          <li>permissões concedidas, datas de expiração de tokens e, no fluxo com Facebook, identificador e nome da Página vinculada;</li>
          <li>tokens de acesso do Instagram e, quando aplicável, do Facebook;</li>
          <li>dados de publicações, métricas, comentários, mensagens e outros recursos solicitados por uma ferramenta, recebidos da Meta para executar aquela solicitação;</li>
          <li>eventos enviados pela Meta por webhook, que podem incluir conteúdo de mensagens ou comentários;</li>
          <li>identificadores técnicos e escopos de autorização necessários à conexão MCP e à proteção contra solicitações inválidas.</li>
        </ul>
        <p>O serviço não solicita sua senha do Instagram ou do Facebook. A autenticação ocorre nas telas oficiais da Meta.</p>
      </section>

      <section>
        <h2>3 · Finalidades e armazenamento</h2>
        <p>Usamos esses dados para conectar a conta autorizada, executar as operações escolhidas pelo usuário no ChatGPT, manter tokens atualizados, validar permissões e proteger o serviço contra abuso.</p>
        <p>Os tokens Meta são cifrados antes de serem armazenados. Tokens OAuth do cliente MCP são guardados como hashes. Eventos recebidos por webhook são cifrados no banco e mantidos na caixa de entrada operacional por até 90 dias; eventos mais antigos são removidos durante a manutenção do inbox.</p>
        <p>O Blend Insight não mantém uma cópia permanente de respostas de métricas ou de conteúdo obtidas sob demanda, salvo quando um evento de webhook precisa ficar disponível na caixa de entrada para consulta. Solicitações e respostas MCP não são salvas como histórico de conversa no banco do serviço.</p>
      </section>

      <section>
        <h2>4 · Compartilhamento e operadores técnicos</h2>
        <p>Para entregar a função solicitada, os dados necessários são transmitidos à Meta por suas APIs e à instância do ChatGPT que iniciou a conexão MCP. O banco de dados é hospedado pela Neon e a aplicação pela Vercel. Esses provedores processam dados técnicos na medida necessária para prestar hospedagem e banco de dados, conforme seus próprios termos e políticas.</p>
        <p>O Blend Insight não vende dados, não os utiliza para publicidade e não os compartilha com terceiros para fins de marketing. O usuário também deve considerar as políticas do ChatGPT e da Meta ao conectar suas contas.</p>
      </section>

      <section>
        <h2>5 · Retenção, revogação e exclusão</h2>
        <p>Os dados de conexão permanecem enquanto a conta estiver vinculada e forem necessários para prestar o serviço. Você pode revogar o acesso do Blend Insight nas configurações de aplicativos e integrações da Meta e pedir a exclusão dos dados associados.</p>
        <p>Para instruções e para enviar uma solicitação, visite <a href="/data-deletion">Exclusão de dados</a>. A solicitação abrange os dados da conta vinculada, tokens guardados, registros OAuth associados e eventos de webhook identificáveis, ressalvados dados que precisem ser mantidos por obrigação legal.</p>
      </section>

      <section>
        <h2>6 · Segurança</h2>
        <p>O serviço usa HTTPS, controle por OAuth e PKCE para a conexão MCP, armazenamento cifrado dos tokens Meta e validação de assinatura nos webhooks. Nenhuma medida de segurança elimina todos os riscos; mantenha sua conta Meta protegida e revogue acessos que não reconhecer.</p>
      </section>

      <section>
        <h2>7 · Seus direitos e atualizações</h2>
        <p>Você pode solicitar acesso, correção ou exclusão dos dados associados à sua conta pelo email de contato. Esta política pode ser atualizada quando o funcionamento do serviço mudar; a data de vigência no início da página será atualizada junto com a publicação.</p>
      </section>
    </LegalDocument>
  );
}
