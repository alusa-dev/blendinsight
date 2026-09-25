import type { Metadata } from "next";
import { LegalDocument } from "../_components/legal-document";

export const metadata: Metadata = {
  title: "Exclusão de dados | Blend Insight",
  description: "Como revogar o acesso e solicitar a exclusão dos dados armazenados pelo Blend Insight.",
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  return (
    <LegalDocument
      eyebrow="Seus dados"
      title="Desconectar e apagar seus dados."
      intro="Você pode revogar o acesso do Blend Insight na Meta e pedir que os dados associados à conta conectada sejam removidos."
    >
      <section>
        <h2>Como solicitar a exclusão</h2>
        <ol>
          <li>Envie um email para <a href="mailto:gestao.alusa@gmail.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados">gestao.alusa@gmail.com</a> com o assunto “Solicitação de exclusão de dados”.</li>
          <li>Informe o nome de usuário do Instagram conectado e que deseja excluir os dados armazenados pelo Blend Insight. Se houver mais de uma conta, indique cada nome de usuário.</li>
          <li>Por segurança, não inclua sua senha, códigos de autenticação ou tokens. Se precisarmos confirmar que a solicitação é sua, responderemos pedindo apenas informações adequadas para localizar a conta.</li>
        </ol>
      </section>

      <section>
        <h2>O que será removido</h2>
        <p>Após localizar a conta, serão removidos os dados de perfil e vínculo armazenados pelo serviço, tokens Meta cifrados, credenciais OAuth MCP associados e eventos de webhook identificáveis dessa conta. A remoção do vínculo invalida o uso futuro desses registros pelo Blend Insight.</p>
        <p>Informações que precisem ser mantidas por obrigação legal poderão ser retidas pelo período exigido. A Meta pode manter dados sob suas próprias políticas; a exclusão no Blend Insight não apaga dados que estejam nos sistemas da Meta, no ChatGPT ou em outros serviços independentes.</p>
      </section>

      <section>
        <h2>Revogar o acesso na Meta</h2>
        <p>Você também pode remover a integração nas configurações da sua conta Meta, na área de aplicativos e integrações conectados. Revogar o acesso impede novas chamadas autorizadas, mas envie o email acima para pedir a eliminação dos dados já armazenados pelo Blend Insight.</p>
      </section>

      <section>
        <h2>Confirmação</h2>
        <p>Responderemos ao email utilizado para solicitar a exclusão para confirmar o recebimento e informar quando o processamento for concluído. Para dúvidas, escreva para <a href="mailto:gestao.alusa@gmail.com">gestao.alusa@gmail.com</a>.</p>
      </section>
    </LegalDocument>
  );
}
