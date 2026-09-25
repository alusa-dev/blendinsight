import type { Metadata } from "next";
import { LegalDocument } from "../_components/legal-document";

export const metadata: Metadata = {
  title: "Suporte | Blend Insight",
  description: "Contato para suporte, privacidade e solicitações sobre o Blend Insight.",
  robots: { index: true, follow: true },
};

export default function SupportPage() {
  return (
    <LegalDocument
      eyebrow="Contato e suporte"
      title="Fale com o responsável."
      intro="Use este canal para dúvidas sobre a conexão, segurança, privacidade ou funcionamento do Blend Insight."
    >
      <section>
        <h2>Contato</h2>
        <span className="legal-contact-label">Email de suporte</span>
        <p><a href="mailto:gestao.alusa@gmail.com">gestao.alusa@gmail.com</a></p>
        <p>Ao entrar em contato, informe o nome de usuário da conta conectada e descreva o problema. Não envie senhas, códigos de autenticação ou tokens de acesso.</p>
      </section>
      <section>
        <h2>Documentos</h2>
        <ul>
          <li><a href="/privacy">Política de Privacidade</a></li>
          <li><a href="/terms">Termos de Serviço</a></li>
          <li><a href="/data-deletion">Instruções para exclusão de dados</a></li>
        </ul>
      </section>
    </LegalDocument>
  );
}
