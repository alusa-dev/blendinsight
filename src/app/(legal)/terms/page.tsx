import type { Metadata } from "next";
import { LegalDocument } from "../_components/legal-document";

export const metadata: Metadata = {
  title: "Termos de Serviço | Blend Insight",
  description: "Condições para uso pessoal do Blend Insight e de sua integração com a Meta.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Termos de serviço"
      title="Uso responsável da integração."
      intro="Estes termos descrevem as condições para utilizar o Blend Insight, uma ferramenta pessoal que conecta uma conta profissional do Instagram ao ChatGPT."
    >
      <section>
        <h2>1 · Aceitação e escopo</h2>
        <p>Ao autorizar uma conexão ou usar o servidor MCP do Blend Insight, você concorda com estes termos e com a <a href="/privacy">Política de Privacidade</a>. O serviço é destinado ao uso pessoal pelo titular da conta ou por pessoa autorizada por ele; atualmente não há cobrança pelo acesso.</p>
        <p>Blend Insight é um projeto independente e não é afiliado, patrocinado ou endossado pela Meta, pelo Instagram ou pela OpenAI. Essas marcas pertencem aos respectivos titulares.</p>
      </section>

      <section>
        <h2>2 · Autorização da conta</h2>
        <p>Conecte somente contas do Instagram, Páginas do Facebook e ativos que você controla ou para os quais possui autorização. A Meta determina quais tipos de conta, permissões, recursos e operações estão disponíveis. Você pode revogar a autorização a qualquer momento nas configurações da Meta.</p>
      </section>

      <section>
        <h2>3 · Uso das ferramentas e ações</h2>
        <p>O Blend Insight permite consultar informações e, conforme as permissões concedidas, pode publicar ou administrar conteúdo, mensagens, comentários, configurações e outros recursos do Instagram. Instruções enviadas pelo usuário através do ChatGPT podem produzir alterações na conta.</p>
        <p>Revise cuidadosamente o conteúdo, o destino e os efeitos de cada ação antes de solicitá-la. Você é responsável por possuir os direitos e as autorizações necessários e por respeitar as regras da Meta, as leis aplicáveis e os direitos de outras pessoas.</p>
      </section>

      <section>
        <h2>4 · Uso proibido</h2>
        <p>Não use o serviço para contornar limites ou controles da Meta, acessar contas sem autorização, enviar spam, violar direitos autorais ou de privacidade, nem executar ações que violem as políticas da Meta ou a legislação aplicável. Não envie senhas ou tokens em mensagens ao ChatGPT ou ao suporte.</p>
      </section>

      <section>
        <h2>5 · Serviços de terceiros e disponibilidade</h2>
        <p>O serviço depende da Meta, do ChatGPT, da Neon e da Vercel. Seus recursos, limites, requisitos de acesso e disponibilidade podem mudar, e uma API ou permissão pode ser suspensa ou retirada por seu fornecedor. O Blend Insight não controla esses serviços de terceiros.</p>
      </section>

      <section>
        <h2>6 · Interrupção e exclusão</h2>
        <p>Você pode parar de usar o serviço revogando o acesso à Meta e solicitar a exclusão dos dados associados conforme a página de <a href="/data-deletion">Exclusão de dados</a>. O acesso também pode ser suspenso quando necessário para proteger a conta ou cumprir obrigações legais.</p>
      </section>

      <section>
        <h2>7 · Alterações e contato</h2>
        <p>Estes termos podem ser atualizados se o serviço mudar. A versão vigente é a publicada nesta página. Para dúvidas, escreva para <a href="mailto:gestao.alusa@gmail.com">gestao.alusa@gmail.com</a>.</p>
      </section>
    </LegalDocument>
  );
}
